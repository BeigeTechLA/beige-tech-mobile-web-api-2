/**
 * Encryption Service
 * Handles room key generation and distribution on the backend
 *
 * Note: This stores raw room keys on server for automatic key distribution.
 * This provides encryption-at-rest but server can technically decrypt messages.
 * For true E2E, keys should only exist on client devices.
 */

const crypto = require('crypto');
const { ChatRoom, User } = require('../models');
const logger = require('../config/logger');

// AES-256 key size in bytes
const AES_KEY_SIZE = 32;

/**
 * Generate a new AES-256 room key
 */
const generateRoomKey = () => {
  return crypto.randomBytes(AES_KEY_SIZE).toString('base64');
};

/**
 * Encrypt room key with user's RSA public key
 */
const encryptRoomKeyForUser = (roomKeyBase64, publicKeyPem) => {
  try {
    const roomKeyBuffer = Buffer.from(roomKeyBase64, 'base64');
    const encryptedBuffer = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      roomKeyBuffer
    );
    return encryptedBuffer.toString('base64');
  } catch (error) {
    logger.error(`Failed to encrypt room key: ${error.message}`);
    throw error;
  }
};

/**
 * Initialize encryption for a chat room
 * Called when chat room is created
 */
const initializeRoomEncryption = async (chatRoomId, participantIds) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      throw new Error('Chat room not found');
    }

    // Generate new room key
    const roomKey = generateRoomKey();

    // Get public keys for all participants
    const users = await User.find({
      _id: { $in: participantIds },
      'e2e_encryption.enabled': true,
      'e2e_encryption.public_key': { $ne: null },
    }).select('_id e2e_encryption.public_key');

    // Encrypt room key for each participant
    const participantKeys = [];
    for (const user of users) {
      try {
        const encryptedRoomKey = encryptRoomKeyForUser(
          roomKey,
          user.e2e_encryption.public_key
        );
        participantKeys.push({
          user_id: user._id,
          encrypted_room_key: encryptedRoomKey,
          key_version: 1,
          granted_by: participantIds[0], // First participant (usually admin/creator)
          granted_at: new Date(),
        });
      } catch (err) {
        logger.warn(`Could not encrypt room key for user ${user._id}: ${err.message}`);
      }
    }

    // Update chat room with encryption data
    chatRoom.encryption = {
      enabled: true,
      room_key: roomKey, // Store raw key for future participant additions
      participant_keys: participantKeys,
    };

    await chatRoom.save();

    logger.info(`Initialized encryption for room ${chatRoomId} with ${participantKeys.length} participants`);

    return {
      success: true,
      participantsWithKeys: participantKeys.length,
      participantsWithoutKeys: participantIds.length - participantKeys.length,
    };
  } catch (error) {
    logger.error(`Failed to initialize room encryption: ${error.message}`);
    throw error;
  }
};

/**
 * Grant encryption access to a new participant
 * Called when participant is added to chat room
 */
const grantEncryptionAccess = async (chatRoomId, userId, grantedBy) => {
  try {
    // Must explicitly select room_key since it has select: false in model
    const chatRoom = await ChatRoom.findById(chatRoomId).select('+encryption.room_key');
    if (!chatRoom) {
      throw new Error('Chat room not found');
    }

    // Check if room has encryption - no encryption means nothing to grant, treat as success
    if (!chatRoom.encryption?.enabled || !chatRoom.encryption?.room_key) {
      logger.info(`Room ${chatRoomId} does not have encryption enabled`);
      return { success: true, reason: 'Room encryption not enabled' };
    }

    // Check if user already has a key
    const existingKey = chatRoom.encryption.participant_keys?.find(
      pk => pk.user_id.toString() === userId.toString()
    );
    if (existingKey) {
      logger.info(`User ${userId} already has encryption key for room ${chatRoomId}`);
      return { success: true, alreadyHasKey: true };
    }

    // Get user's public key
    const user = await User.findById(userId).select('e2e_encryption.public_key e2e_encryption.enabled');
    if (!user?.e2e_encryption?.enabled || !user?.e2e_encryption?.public_key) {
      logger.warn(`User ${userId} does not have E2E encryption enabled, skipping key grant`);
      return { success: true, reason: 'User does not have E2E encryption enabled' };
    }

    // Encrypt room key for this user
    const encryptedRoomKey = encryptRoomKeyForUser(
      chatRoom.encryption.room_key,
      user.e2e_encryption.public_key
    );

    // Add to participant keys
    chatRoom.encryption.participant_keys = chatRoom.encryption.participant_keys || [];
    chatRoom.encryption.participant_keys.push({
      user_id: userId,
      encrypted_room_key: encryptedRoomKey,
      key_version: 1,
      granted_by: grantedBy,
      granted_at: new Date(),
    });

    await chatRoom.save();

    logger.info(`Granted encryption access to user ${userId} for room ${chatRoomId}`);

    return { success: true };
  } catch (error) {
    logger.error(`Failed to grant encryption access: ${error.message}`);
    throw error;
  }
};

/**
 * Revoke encryption access from a participant
 * Called when participant is removed from chat room
 */
const revokeEncryptionAccess = async (chatRoomId, userId) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      throw new Error('Chat room not found');
    }

    if (!chatRoom.encryption?.participant_keys) {
      return { success: true, reason: 'No encryption keys to revoke' };
    }

    // Remove user's key
    const initialLength = chatRoom.encryption.participant_keys.length;
    chatRoom.encryption.participant_keys = chatRoom.encryption.participant_keys.filter(
      pk => pk.user_id.toString() !== userId.toString()
    );

    if (chatRoom.encryption.participant_keys.length < initialLength) {
      await chatRoom.save();
      logger.info(`Revoked encryption access for user ${userId} from room ${chatRoomId}`);
      return { success: true };
    }

    return { success: true, reason: 'User did not have encryption key' };
  } catch (error) {
    logger.error(`Failed to revoke encryption access: ${error.message}`);
    throw error;
  }
};

/**
 * Grant encryption access to multiple participants at once
 */
const grantEncryptionAccessToMultiple = async (chatRoomId, userIds, grantedBy) => {
  const results = {
    granted: [],
    failed: [],
  };

  for (const userId of userIds) {
    try {
      const result = await grantEncryptionAccess(chatRoomId, userId, grantedBy);
      if (result.success) {
        results.granted.push(userId);
      } else {
        results.failed.push({ userId, reason: result.reason });
      }
    } catch (error) {
      results.failed.push({ userId, reason: error.message });
    }
  }

  return results;
};

/**
 * Ensure all current participants have encryption keys
 * Called to sync encryption keys for all participants
 */
const syncRoomEncryptionKeys = async (chatRoomId) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      throw new Error('Chat room not found');
    }

    if (!chatRoom.encryption?.enabled) {
      return { success: false, reason: 'Room encryption not enabled' };
    }

    // Collect all participant IDs
    const allParticipantIds = new Set();
    if (chatRoom.client_id) allParticipantIds.add(chatRoom.client_id.toString());
    if (chatRoom.pm_id) allParticipantIds.add(chatRoom.pm_id.toString());
    if (chatRoom.cp_ids) {
      chatRoom.cp_ids.forEach(cp => {
        if (cp.id) allParticipantIds.add(cp.id.toString());
      });
    }
    if (chatRoom.production_ids) {
      chatRoom.production_ids.forEach(p => {
        if (p.id) allParticipantIds.add(p.id.toString());
      });
    }
    if (chatRoom.manager_ids) {
      chatRoom.manager_ids.forEach(m => {
        if (m.id) allParticipantIds.add(m.id.toString());
      });
    }

    // Find participants who don't have keys
    const participantsWithKeys = new Set(
      chatRoom.encryption.participant_keys?.map(pk => pk.user_id.toString()) || []
    );
    const participantsMissingKeys = [...allParticipantIds].filter(
      id => !participantsWithKeys.has(id)
    );

    if (participantsMissingKeys.length === 0) {
      return { success: true, message: 'All participants have encryption keys' };
    }

    // Grant keys to missing participants
    const result = await grantEncryptionAccessToMultiple(
      chatRoomId,
      participantsMissingKeys,
      chatRoom.client_id?.toString() || participantsMissingKeys[0]
    );

    return {
      success: true,
      granted: result.granted.length,
      failed: result.failed.length,
    };
  } catch (error) {
    logger.error(`Failed to sync room encryption keys: ${error.message}`);
    throw error;
  }
};

module.exports = {
  generateRoomKey,
  encryptRoomKeyForUser,
  initializeRoomEncryption,
  grantEncryptionAccess,
  revokeEncryptionAccess,
  grantEncryptionAccessToMultiple,
  syncRoomEncryptionKeys,
};
