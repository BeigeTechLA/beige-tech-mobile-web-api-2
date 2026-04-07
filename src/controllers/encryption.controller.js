const httpStatus = require("http-status");
const crypto = require("crypto");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");
const User = require("../models/user.model");
const ChatRoom = require("../models/chatRoom.model");

// Server master key for encrypting user private keys (use env variable in production)
const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || crypto.createHash('sha256').update('default-master-key-change-in-production').digest();

/**
 * Encrypt private key with server master key for backup
 * Uses AES-256-GCM for authenticated encryption
 */
const encryptWithMasterKey = (plaintext) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  return JSON.stringify({ iv: iv.toString('base64'), encrypted, authTag });
};

/**
 * Decrypt private key with server master key
 */
const decryptWithMasterKey = (encryptedData) => {
  const { iv, encrypted, authTag } = JSON.parse(encryptedData);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * Encrypt a room key with a user's public key using RSA-OAEP
 */
const encryptRoomKeyWithPublicKey = (roomKeyBase64, publicKeyPem) => {
  const roomKeyBuffer = Buffer.from(roomKeyBase64, "base64");
  const encryptedBuffer = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    roomKeyBuffer
  );
  return encryptedBuffer.toString("base64");
};

/**
 * Re-encrypt existing room keys + grant missing room keys for a user.
 * Called when user sets up or changes their RSA keys.
 *
 * 1. Re-encrypts room keys the user already has (for key change scenario)
 * 2. Grants room keys for rooms where user is a participant but doesn't have a key yet
 *    (for first-time setup scenario - room was created before user had encryption)
 */
const syncRoomKeysForUser = async (userId, newPublicKeyPem) => {
  try {
    const userIdStr = userId.toString();

    // --- Part 1: Re-encrypt existing room keys ---
    const roomsWithKey = await ChatRoom.find({
      "encryption.enabled": true,
      "encryption.participant_keys.user_id": userId,
    }).select("+encryption.room_key");

    let reEncrypted = 0;
    for (const room of roomsWithKey) {
      if (!room.encryption?.room_key) continue;
      try {
        const newEncryptedRoomKey = encryptRoomKeyWithPublicKey(room.encryption.room_key, newPublicKeyPem);
        const keyIndex = room.encryption.participant_keys.findIndex(
          (pk) => pk.user_id.toString() === userIdStr
        );
        if (keyIndex >= 0) {
          room.encryption.participant_keys[keyIndex].encrypted_room_key = newEncryptedRoomKey;
          room.encryption.participant_keys[keyIndex].granted_at = new Date();
          await room.save();
          reEncrypted++;
        }
      } catch (err) {
        console.warn(`Failed to re-encrypt room key for room ${room._id}:`, err.message);
      }
    }

    // --- Part 2: Grant keys for rooms where user is participant but has no key ---
    // Find all rooms where this user is a participant (any role)
    const allUserRooms = await ChatRoom.find({
      "encryption.enabled": true,
      $or: [
        { client_id: userId },
        { pm_id: userId },
        { "cp_ids.id": userId },
        { "production_ids.id": userId },
        { "manager_ids.id": userId },
      ],
    }).select("+encryption.room_key");

    let granted = 0;
    for (const room of allUserRooms) {
      if (!room.encryption?.room_key) continue;
      // Check if user already has a key
      const hasKey = room.encryption.participant_keys?.some(
        (pk) => pk.user_id.toString() === userIdStr
      );
      if (hasKey) continue;

      try {
        const encryptedRoomKey = encryptRoomKeyWithPublicKey(room.encryption.room_key, newPublicKeyPem);
        room.encryption.participant_keys = room.encryption.participant_keys || [];
        room.encryption.participant_keys.push({
          user_id: userId,
          encrypted_room_key: encryptedRoomKey,
          key_version: 1,
          granted_by: userId,
          granted_at: new Date(),
        });
        await room.save();
        granted++;
      } catch (err) {
        console.warn(`Failed to grant room key for room ${room._id}:`, err.message);
      }
    }

    if (reEncrypted > 0 || granted > 0) {
      console.log(`User ${userId}: re-encrypted ${reEncrypted} room keys, granted ${granted} new room keys`);
    }
  } catch (err) {
    console.warn("Failed to sync room keys for user:", err.message);
  }
};

/**
 * Setup E2E encryption for a user
 * Supports two modes:
 * 1. WhatsApp-style: Auto-generated keys (just publicKey, autoGenerated: true)
 * 2. Password-protected: Full backup with encrypted private key
 */
const setupE2E = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { publicKey, privateKey, encryptedPrivateKey, keySalt, autoGenerated } = req.body;

  if (!publicKey) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Public key is required");
  }

  // WhatsApp-style: Auto-generated keys - store private key encrypted with server master key
  if (autoGenerated) {
    // Encrypt private key with server master key for backup/recovery
    let serverEncryptedPrivateKey = null;
    if (privateKey) {
      serverEncryptedPrivateKey = encryptWithMasterKey(privateKey);
    }

    await User.findByIdAndUpdate(userId, {
      e2e_encryption: {
        enabled: true,
        public_key: publicKey,
        encrypted_private_key: serverEncryptedPrivateKey, // Server-encrypted backup
        key_salt: null,
        key_version: 1,
        setup_at: new Date(),
        auto_generated: true,
      },
    });

    // Re-encrypt all existing room keys for this user with the new public key
    // This handles the case where user opens a new browser/clears cache
    await syncRoomKeysForUser(userId, publicKey);

    return res.status(httpStatus.OK).json({
      success: true,
      message: "E2E encryption auto-setup complete",
    });
  }

  // Password-protected mode: Full backup
  if (!encryptedPrivateKey || !keySalt) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Missing required encryption keys for password-protected mode");
  }

  await User.findByIdAndUpdate(userId, {
    e2e_encryption: {
      enabled: true,
      public_key: publicKey,
      encrypted_private_key: encryptedPrivateKey,
      key_salt: keySalt,
      key_version: 1,
      setup_at: new Date(),
      auto_generated: false,
    },
  });

  // Re-encrypt all existing room keys for this user with the new public key
  await syncRoomKeysForUser(userId, publicKey);

  res.status(httpStatus.OK).json({
    success: true,
    message: "E2E encryption setup complete",
  });
});

/**
 * Get user's public key
 */
const getUserPublicKey = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select("e2e_encryption.public_key e2e_encryption.enabled");

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.e2e_encryption?.enabled || !user.e2e_encryption?.public_key) {
    throw new ApiError(httpStatus.NOT_FOUND, "User has not set up E2E encryption");
  }

  res.status(httpStatus.OK).json({
    publicKey: user.e2e_encryption.public_key,
  });
});

/**
 * Get multiple users' public keys (batch)
 */
const getBatchPublicKeys = catchAsync(async (req, res) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "userIds must be a non-empty array");
  }

  const users = await User.find({
    _id: { $in: userIds },
    "e2e_encryption.enabled": true,
  }).select("_id e2e_encryption.public_key");

  const publicKeys = {};
  users.forEach((user) => {
    if (user.e2e_encryption?.public_key) {
      publicKeys[user._id.toString()] = user.e2e_encryption.public_key;
    }
  });

  res.status(httpStatus.OK).json({ publicKeys });
});

/**
 * Get recovery data for key recovery on new device
 * Decrypts server-stored private key and returns it
 */
const getRecoveryData = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const user = await User.findById(userId).select(
    "e2e_encryption.public_key e2e_encryption.encrypted_private_key e2e_encryption.key_salt e2e_encryption.key_version e2e_encryption.auto_generated"
  );

  if (!user || !user.e2e_encryption?.enabled) {
    throw new ApiError(httpStatus.NOT_FOUND, "E2E encryption not set up");
  }

  // If auto-generated keys, decrypt with server master key
  let privateKey = null;
  if (user.e2e_encryption.auto_generated && user.e2e_encryption.encrypted_private_key) {
    try {
      privateKey = decryptWithMasterKey(user.e2e_encryption.encrypted_private_key);
    } catch (err) {
      console.error("Failed to decrypt private key:", err.message);
    }
  }

  res.status(httpStatus.OK).json({
    publicKey: user.e2e_encryption.public_key,
    privateKey: privateKey, // Decrypted private key for auto-generated mode
    encryptedPrivateKey: user.e2e_encryption.auto_generated ? null : user.e2e_encryption.encrypted_private_key,
    keySalt: user.e2e_encryption.key_salt,
    keyVersion: user.e2e_encryption.key_version,
  });
});

/**
 * Store encrypted room keys for participants
 */
const storeRoomKeys = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const { keys, rawRoomKey } = req.body;
  const grantedBy = req.user.id;

  if (!Array.isArray(keys) || keys.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "keys must be a non-empty array");
  }

  const chatRoom = await ChatRoom.findById(roomId).select("+encryption.room_key");
  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
  }

  // Add or update participant keys
  for (const key of keys) {
    const { userId, encryptedRoomKey, keyVersion } = key;

    // Check if key already exists for this user
    const existingKeyIndex = chatRoom.encryption.participant_keys.findIndex(
      (pk) => pk.user_id.toString() === userId
    );

    const keyData = {
      user_id: userId,
      encrypted_room_key: encryptedRoomKey,
      key_version: keyVersion || 1,
      granted_by: key.grantedBy || grantedBy,
      granted_at: new Date(),
    };

    if (existingKeyIndex >= 0) {
      // Update existing key
      chatRoom.encryption.participant_keys[existingKeyIndex] = keyData;
    } else {
      // Add new key
      chatRoom.encryption.participant_keys.push(keyData);
    }
  }

  // Enable encryption for the room
  chatRoom.encryption.enabled = true;

  // Store the raw room key if provided (needed for plain key distribution to other participants)
  // CRITICAL FIX: Always update room key if provided to prevent key mismatch
  // The sender who creates encryption should be the source of truth
  if (rawRoomKey) {
    chatRoom.encryption.room_key = rawRoomKey;
    console.log(`✅ Room key updated for room ${roomId}`);
  }

  await chatRoom.save();

  res.status(httpStatus.OK).json({
    success: true,
    message: "Room keys stored successfully",
  });
});

/**
 * Get user's encrypted room key for a specific room
 * Auto-initializes encryption if room doesn't have it yet
 * Auto-grants key if user is participant but missing their key
 */
const getRoomKey = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  let chatRoom = await ChatRoom.findById(roomId).select("+encryption client_id pm_id cp_ids production_ids manager_ids");

  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
  }

  // Don't auto-initialize - let the client create encryption properly via storeRoomKeys
  // Auto-initialization causes key mismatch: server generates key A, client generates key B
  if (!chatRoom.encryption?.enabled || !chatRoom.encryption?.room_key) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Room encryption not initialized yet. Client should call storeRoomKeys first."
    );
  }

  // Find user's key
  let participantKey = chatRoom.encryption.participant_keys.find(
    (pk) => pk.user_id.toString() === userId
  );

  // Auto-grant if user is participant but missing key
  if (!participantKey && chatRoom.encryption.room_key) {
    const user = await User.findById(userId).select("e2e_encryption.public_key e2e_encryption.enabled");
    if (user?.e2e_encryption?.enabled && user?.e2e_encryption?.public_key) {
      try {
        const encrypted = encryptRoomKeyWithPublicKey(chatRoom.encryption.room_key, user.e2e_encryption.public_key);
        const newKey = {
          user_id: userId,
          encrypted_room_key: encrypted,
          key_version: 1,
          granted_by: userId,
          granted_at: new Date(),
        };
        chatRoom.encryption.participant_keys.push(newKey);
        await chatRoom.save();
        participantKey = newKey;
        console.log(`Auto-granted room key to user ${userId} for room ${roomId}`);
      } catch (err) {
        console.warn(`Failed to auto-grant room key:`, err.message);
      }
    }
  }

  if (!participantKey) {
    throw new ApiError(httpStatus.NOT_FOUND, "No encryption key found for user in this room");
  }

  res.status(httpStatus.OK).json({
    encryptedRoomKey: participantKey.encrypted_room_key,
    keyVersion: participantKey.key_version,
  });
});

/**
 * Get plain room key (simplified approach - no RSA)
 * Returns the raw AES room key directly to authorized participants
 */
const getPlainRoomKey = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  let chatRoom = await ChatRoom.findById(roomId).select("+encryption.room_key client_id pm_id cp_ids production_ids manager_ids");

  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
  }

  // Verify user is a participant
  const userIdStr = userId.toString();
  const isParticipant =
    chatRoom.client_id?.toString() === userIdStr ||
    chatRoom.pm_id?.toString() === userIdStr ||
    chatRoom.cp_ids?.some((cp) => cp.id?.toString() === userIdStr) ||
    chatRoom.production_ids?.some((p) => p.id?.toString() === userIdStr) ||
    chatRoom.manager_ids?.some((m) => m.id?.toString() === userIdStr);

  if (!isParticipant) {
    throw new ApiError(httpStatus.FORBIDDEN, "User is not a participant in this room");
  }

  // Don't auto-initialize - let the client create encryption properly via storeRoomKeys
  // Auto-initialization causes key mismatch: server generates key A, client generates key B
  if (!chatRoom.encryption?.enabled || !chatRoom.encryption?.room_key) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Room encryption not initialized yet. Client should call storeRoomKeys first."
    );
  }

  res.status(httpStatus.OK).json({
    roomKey: chatRoom.encryption.room_key,
    keyVersion: 1,
  });
});

/**
 * Get all room keys for current user (for syncing on new device)
 */
const getAllUserRoomKeys = catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Find all chat rooms where user has an encryption key
  const chatRooms = await ChatRoom.find({
    "encryption.enabled": true,
    "encryption.participant_keys.user_id": userId,
  }).select("_id encryption.participant_keys");

  const roomKeys = chatRooms.map((room) => {
    const participantKey = room.encryption.participant_keys.find(
      (pk) => pk.user_id.toString() === userId
    );
    return {
      roomId: room._id.toString(),
      encryptedRoomKey: participantKey.encrypted_room_key,
      keyVersion: participantKey.key_version,
    };
  });

  res.status(httpStatus.OK).json({ roomKeys });
});

/**
 * Check if user has E2E encryption enabled
 */
const checkE2EStatus = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const user = await User.findById(userId).select("e2e_encryption.enabled");

  res.status(httpStatus.OK).json({
    enabled: user?.e2e_encryption?.enabled || false,
  });
});

/**
 * Check if room has encryption enabled (regardless of user's access)
 * Used to determine if we should create a new key or request access
 */
const checkRoomEncryptionStatus = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  const chatRoom = await ChatRoom.findById(roomId).select("encryption client_id pm_id cp_ids production_ids manager_ids");

  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
  }

  const hasEncryption = chatRoom.encryption?.enabled || false;
  const userHasKey = hasEncryption && chatRoom.encryption.participant_keys.some(
    (pk) => pk.user_id.toString() === userId
  );

  // Collect all participant IDs
  const allParticipantIds = new Set();
  if (chatRoom.client_id) allParticipantIds.add(chatRoom.client_id.toString());
  if (chatRoom.pm_id) allParticipantIds.add(chatRoom.pm_id.toString());
  if (chatRoom.cp_ids) {
    chatRoom.cp_ids.forEach((cp) => {
      if (cp.id) allParticipantIds.add(cp.id.toString());
    });
  }
  if (chatRoom.production_ids) {
    chatRoom.production_ids.forEach((p) => {
      if (p.id) allParticipantIds.add(p.id.toString());
    });
  }
  if (chatRoom.manager_ids) {
    chatRoom.manager_ids.forEach((m) => {
      if (m.id) allParticipantIds.add(m.id.toString());
    });
  }

  // Find participants who have encryption keys
  const participantsWithKeys = new Set(
    chatRoom.encryption?.participant_keys?.map((pk) => pk.user_id.toString()) || []
  );

  // Find participants who are missing keys
  const participantsMissingKeys = [...allParticipantIds].filter(
    (id) => !participantsWithKeys.has(id)
  );

  res.status(httpStatus.OK).json({
    roomHasEncryption: hasEncryption,
    userHasKey: userHasKey,
    participantCount: chatRoom.encryption?.participant_keys?.length || 0,
    totalParticipants: allParticipantIds.size,
    participantIds: [...allParticipantIds], // All participant IDs for frontend encryption setup
    participantsMissingKeys: participantsMissingKeys,
  });
});

/**
 * Re-initialize encryption for a specific room (admin only)
 * Used to fix existing rooms that were created before backend key management
 * Generates a new room key and distributes to all current participants
 * NOTE: Old encrypted messages will remain "[Unable to decrypt]"
 */
const reinitializeRoomEncryption = catchAsync(async (req, res) => {
  const { roomId } = req.params;

  const chatRoom = await ChatRoom.findById(roomId).select("+encryption.room_key");
  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
  }

  // Generate new room key
  const roomKey = crypto.randomBytes(32).toString("base64");

  // Collect all participant IDs
  const allParticipantIds = new Set();
  if (chatRoom.client_id) allParticipantIds.add(chatRoom.client_id.toString());
  if (chatRoom.pm_id) allParticipantIds.add(chatRoom.pm_id.toString());
  if (chatRoom.cp_ids) {
    chatRoom.cp_ids.forEach((cp) => {
      if (cp.id) allParticipantIds.add(cp.id.toString());
    });
  }
  if (chatRoom.production_ids) {
    chatRoom.production_ids.forEach((p) => {
      if (p.id) allParticipantIds.add(p.id.toString());
    });
  }
  if (chatRoom.manager_ids) {
    chatRoom.manager_ids.forEach((m) => {
      if (m.id) allParticipantIds.add(m.id.toString());
    });
  }

  // Get public keys for all participants
  const users = await User.find({
    _id: { $in: [...allParticipantIds] },
    "e2e_encryption.enabled": true,
    "e2e_encryption.public_key": { $ne: null },
  }).select("_id e2e_encryption.public_key");

  // Encrypt room key for each participant
  const participantKeys = [];
  const failed = [];
  for (const user of users) {
    try {
      const roomKeyBuffer = Buffer.from(roomKey, "base64");
      const encryptedBuffer = crypto.publicEncrypt(
        {
          key: user.e2e_encryption.public_key,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        roomKeyBuffer
      );
      participantKeys.push({
        user_id: user._id,
        encrypted_room_key: encryptedBuffer.toString("base64"),
        key_version: 1,
        granted_by: req.user.id,
        granted_at: new Date(),
      });
    } catch (err) {
      failed.push({ userId: user._id.toString(), reason: err.message });
    }
  }

  // Update room encryption
  chatRoom.encryption = {
    enabled: true,
    room_key: roomKey,
    participant_keys: participantKeys,
  };
  await chatRoom.save();

  res.status(httpStatus.OK).json({
    success: true,
    message: `Room encryption re-initialized. ${participantKeys.length} participants have keys.`,
    participantsWithKeys: participantKeys.length,
    participantsWithoutKeys: allParticipantIds.size - participantKeys.length,
    failed,
  });
});

/**
 * Re-initialize encryption for ALL rooms that are missing room_key (admin only)
 * Batch migration for existing rooms created before backend key management
 */
const migrateAllRoomEncryption = catchAsync(async (req, res) => {
  // Find rooms that either have no encryption or are missing the raw room_key
  const rooms = await ChatRoom.find({}).select("+encryption _id client_id pm_id cp_ids production_ids manager_ids");

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const room of rooms) {
    // Skip rooms that already have a room_key
    if (room.encryption?.room_key) {
      skipped++;
      continue;
    }

    try {
      // Generate new room key
      const roomKey = crypto.randomBytes(32).toString("base64");

      // Collect participant IDs
      const participantIds = new Set();
      if (room.client_id) participantIds.add(room.client_id.toString());
      if (room.pm_id) participantIds.add(room.pm_id.toString());
      if (room.cp_ids) room.cp_ids.forEach((cp) => { if (cp.id) participantIds.add(cp.id.toString()); });
      if (room.production_ids) room.production_ids.forEach((p) => { if (p.id) participantIds.add(p.id.toString()); });
      if (room.manager_ids) room.manager_ids.forEach((m) => { if (m.id) participantIds.add(m.id.toString()); });

      if (participantIds.size === 0) {
        skipped++;
        continue;
      }

      // Get public keys
      const users = await User.find({
        _id: { $in: [...participantIds] },
        "e2e_encryption.enabled": true,
        "e2e_encryption.public_key": { $ne: null },
      }).select("_id e2e_encryption.public_key");

      const participantKeys = [];
      for (const user of users) {
        try {
          const roomKeyBuffer = Buffer.from(roomKey, "base64");
          const encryptedBuffer = crypto.publicEncrypt(
            {
              key: user.e2e_encryption.public_key,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: "sha256",
            },
            roomKeyBuffer
          );
          participantKeys.push({
            user_id: user._id,
            encrypted_room_key: encryptedBuffer.toString("base64"),
            key_version: 1,
            granted_by: req.user.id,
            granted_at: new Date(),
          });
        } catch {
          // Skip users we can't encrypt for
        }
      }

      room.encryption = {
        enabled: true,
        room_key: roomKey,
        participant_keys: participantKeys,
      };
      await room.save();
      migrated++;
    } catch (err) {
      console.error(`Failed to migrate room ${room._id}:`, err.message);
      errors++;
    }
  }

  res.status(httpStatus.OK).json({
    success: true,
    message: `Migration complete. Migrated: ${migrated}, Skipped (already have key): ${skipped}, Errors: ${errors}`,
    migrated,
    skipped,
    errors,
    total: rooms.length,
  });
});

module.exports = {
  setupE2E,
  getUserPublicKey,
  getBatchPublicKeys,
  getRecoveryData,
  storeRoomKeys,
  getRoomKey,
  getPlainRoomKey,
  getAllUserRoomKeys,
  checkE2EStatus,
  checkRoomEncryptionStatus,
  reinitializeRoomEncryption,
  migrateAllRoomEncryption,
};
