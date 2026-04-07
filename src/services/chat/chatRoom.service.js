/**
 * Chat Room Service
 * Handles chat room CRUD operations
 */

const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { ChatRoom, ChatMessage, User, Order } = require("../../models");
const ApiError = require("../../utils/ApiError");
const encryptionService = require("../encryption.service");

const normalizeExternalOrderRef = (value) => String(value || "").trim();

const findExistingChatRoomByReference = async (reference) => {
  const normalizedRef = normalizeExternalOrderRef(reference);
  const filters = [];

  if (mongoose.Types.ObjectId.isValid(normalizedRef)) {
    filters.push({ order_id: normalizedRef });
  }

  if (normalizedRef) {
    filters.push({ external_order_ref: normalizedRef });
  }

  if (!filters.length) return null;

  return ChatRoom.findOne(filters.length === 1 ? filters[0] : { $or: filters }).populate('client_id', 'name');
};

const normalizeParticipantReference = (reference) => {
  if (!reference) return null;

  if (typeof reference === "string" || typeof reference === "number") {
    const value = String(reference).trim();
    return value ? { id: value, name: value, email: undefined } : null;
  }

  const id = String(reference.id || reference.email || "").trim();
  if (!id) return null;

  return {
    id,
    name: String(reference.name || reference.email || reference.id || "").trim() || id,
    email: String(reference.email || "").trim() || undefined,
  };
};

const buildParticipantEntry = (reference, addedBy = null, extra = {}) => {
  const normalized = normalizeParticipantReference(reference);
  if (!normalized?.id) return null;

  return {
    id: normalized.id,
    name: normalized.name,
    email: normalized.email,
    added_at: new Date(),
    added_by: addedBy,
    ...extra,
  };
};

/**
 * Generate a unique chat ID
 * Starts with 3 digits (100-999), expands to 4 digits (1000-9999), then 5 digits, etc.
 * Checks existing chat_ids to ensure uniqueness
 */
const generateUniqueChatId = async () => {
  let chatId;
  let isUnique = false;
  let currentDigits = 3; // Start with 3 digits
  const maxDigits = 6; // Max 6 digits (100000-999999)

  while (!isUnique && currentDigits <= maxDigits) {
    const min = Math.pow(10, currentDigits - 1); // 100, 1000, 10000, etc.
    const max = Math.pow(10, currentDigits) - 1; // 999, 9999, 99999, etc.
    let attempts = 0;
    const maxAttempts = 50; // Try 50 random numbers per digit range

    while (!isUnique && attempts < maxAttempts) {
      // Generate random number within current digit range
      chatId = String(Math.floor(min + Math.random() * (max - min + 1)));

      // Check if it already exists
      const existing = await ChatRoom.findOne({ chat_id: chatId });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    // If not found in current digit range, move to next digit range
    if (!isUnique) {
      currentDigits++;
    }
  }

  // Ultimate fallback: use timestamp-based ID
  if (!isUnique) {
    chatId = String(Date.now()).slice(-6);
  }

  return chatId;
};

/**
 * Format client name for chat naming convention
 * Converts "Lana Guzman" to "Lana_Guzman"
 */
const formatClientNameForChat = (clientName) => {
  if (!clientName) return "Unknown";
  return clientName.replace(/\s+/g, '_');
};

const serializeChatRoom = (room) => {
  if (!room) return room;

  const serialized =
    typeof room.toJSON === "function"
      ? room.toJSON({ flattenMaps: true })
      : room.toObject
        ? room.toObject({ flattenMaps: true })
        : room;

  if (serialized.unread_counts instanceof Map) {
    serialized.unread_counts = Object.fromEntries(serialized.unread_counts);
  }

  if (!serialized.id && serialized._id) {
    serialized.id = serialized._id.toString();
  }

  return serialized;
};

/**
 * Migrate existing chat room to new naming convention if needed
 * Generates chat_id and name if they don't exist
 */
const migrateChatRoomNaming = async (room) => {
  if (!room) return room;

  // If room already has chat_id and name, skip migration
  if (room.chat_id && room.name) return room;

  try {
    // Generate chat_id if missing
    let chatId = room.chat_id;
    if (!chatId) {
      chatId = await generateUniqueChatId();
    }

    // Get client name for naming convention
    let clientName = "Unknown";
    if (room.client_id) {
      if (typeof room.client_id === 'object' && room.client_id.name) {
        clientName = room.client_id.name;
      } else {
        // Need to fetch client info
        const client = await User.findById(room.client_id).select('name');
        if (client?.name) {
          clientName = client.name;
        }
      }
    }

    const formattedClientName = formatClientNameForChat(clientName);
    const chatName = `${formattedClientName}_${chatId}`;

    // Update the chat room in database and return the updated document
    const updatedRoom = await ChatRoom.findByIdAndUpdate(
      room._id,
      { chat_id: chatId, name: chatName },
      { new: true }
    ).populate('client_id', 'name profile_picture')
     .populate('order_id', 'order_name order_status shoot_datetimes')
     .populate('last_message');

    // Return the updated room or the original if update failed
    return updatedRoom || room;
  } catch (error) {
    console.error('Error migrating chat room naming:', error.message);
    return room;
  }
};

/**
 * Retrieve chat rooms based on the provided filter and options.
 * Also includes chat rooms where user was removed (for persistent history per PRD).
 */
const getChatRooms = async (filter, options, userId = null) => {
  try {
    if (userId) {
      const userIdObj = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;

      const activeRoomsResult = await ChatRoom.paginateChat(filter, options);

      // Migrate existing rooms to new naming convention
      for (let i = 0; i < activeRoomsResult.results.length; i++) {
        activeRoomsResult.results[i] = serializeChatRoom(await migrateChatRoomNaming(activeRoomsResult.results[i]));
      }

      let removedRoomsQuery = ChatRoom.find({
        "removed_participants.user_id": userIdObj
      }).sort({ updatedAt: -1 });

      if (options.populate) {
        options.populate.split(",").forEach((populateOption) => {
          removedRoomsQuery = removedRoomsQuery.populate(
            populateOption
              .split(".")
              .reverse()
              .reduce((a, b) => ({ path: b, populate: a }))
          );
        });
      }

      const removedRooms = await removedRoomsQuery.exec();

      const activeRoomIds = new Set(activeRoomsResult.results.map(r => r._id.toString()));
      const uniqueRemovedRooms = removedRooms.filter(
        r => !activeRoomIds.has(r._id.toString())
      );

      const markedRemovedRooms = await Promise.all(uniqueRemovedRooms.map(async (room) => {
        const roomObj = serializeChatRoom(room);
        if (!roomObj.id && roomObj._id) {
          roomObj.id = roomObj._id.toString();
        }
        roomObj.isRemovedParticipant = true;
        const removedInfo = roomObj.removed_participants?.find(
          rp => rp.user_id?.toString() === userId.toString()
        );
        if (removedInfo) {
          roomObj.removedAt = removedInfo.removed_at;
          roomObj.lastVisibleMessage = removedInfo.last_visible_message;

          if (removedInfo.last_visible_message) {
            const lastVisibleMsg = await ChatMessage.findById(removedInfo.last_visible_message)
              .populate('sent_by', 'name profile_picture');
            if (lastVisibleMsg) {
              roomObj.last_message = serializeChatRoom(lastVisibleMsg);
            }
          } else {
            roomObj.last_message = null;
          }
        }
        return roomObj;
      }));

      const combinedResults = [...activeRoomsResult.results, ...markedRemovedRooms];
      combinedResults.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      const limit = options.limit ? parseInt(options.limit, 10) : 10;
      const page = options.page ? parseInt(options.page, 10) : 1;
      const startIndex = (page - 1) * limit;
      const paginatedResults = combinedResults.slice(startIndex, startIndex + limit);

      return {
        results: paginatedResults,
        page,
        limit,
        totalPages: Math.ceil(combinedResults.length / limit),
        totalResults: combinedResults.length,
      };
    }

    const result = await ChatRoom.paginateChat(filter, options);

    // Migrate existing rooms to new naming convention
    for (let i = 0; i < result.results.length; i++) {
      result.results[i] = serializeChatRoom(await migrateChatRoomNaming(result.results[i]));
    }

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Retrieve a chat room by ID.
 */
const getChatRoomById = async (roomId) => {
  try {
    const room = await ChatRoom.findById(roomId).populate('client_id', 'name');
    return serializeChatRoom(await migrateChatRoomNaming(room));
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Retrieve a chat room by Order ID.
 */
const getChatRoomByOrderId = async (orderId) => {
  try {
    const room = await findExistingChatRoomByReference(orderId);
    return serializeChatRoom(await migrateChatRoomNaming(room));
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get Chat room by userId. User Id can be client id, cp id or pm id
 */
const getChatRoomByUserId = async (userId) => {
  try {
    return ChatRoom.find().or([{ cp_id: userId }, { client_id: userId }]);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Create a chat room based on the provided request body.
 * Chat is only created when admin explicitly starts it (not on order creation).
 * Accepts initial participants (cp_ids) to add to the chat.
 *
 * @param {Object} reqBody - Request body containing order_id/external_order_ref and optional participants
 * @param {Array} reqBody.participants - Optional array of participant objects with { id, role }
 * @param {Object|string} adminRef - The admin user who is creating the chat
 */
const createChatRoom = async (reqBody, adminRef = null) => {
  const { order_id: orderId, external_order_ref: externalOrderRefRaw, participants = [], name: requestedName } = reqBody;
  const normalizedOrderRef = normalizeExternalOrderRef(externalOrderRefRaw || orderId);

  try {
    let order = null;
    if (mongoose.Types.ObjectId.isValid(String(orderId || ""))) {
      order = await Order.findById(orderId).populate('client_id', 'name');
    }

    const existingChatRoom = await findExistingChatRoomByReference(normalizedOrderRef);
    if (existingChatRoom) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Chat room already exists");
    }

    // Generate unique 3-digit chat ID
    const chatId = await generateUniqueChatId();

    // Get client name for chat naming convention
    const clientName = order?.client_id?.name || normalizedOrderRef || "Unknown";
    const formattedClientName = formatClientNameForChat(clientName);
    const chatName = String(requestedName || "").trim() || `${formattedClientName}_${chatId}`;
    const adminUser = normalizeParticipantReference(adminRef);

    const chatRoomData = {
      chat_id: chatId,
      name: chatName,
      cp_ids: [],
      manager_ids: [],
    };

    if (order?._id) {
      chatRoomData.order_id = order._id;
    } else if (normalizedOrderRef) {
      // External Beige-linked rooms may not have a local Order document.
      // Assign a synthetic ObjectId so the legacy unique order_id index does not collide on null.
      chatRoomData.order_id = new mongoose.Types.ObjectId();
      chatRoomData.external_order_ref = normalizedOrderRef;
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, "order_id or external_order_ref is required");
    }

    // Add the admin who started the chat
    if (adminUser?.id) {
      chatRoomData.manager_ids = [buildParticipantEntry(adminUser, adminUser.id, { role: 'admin' })].filter(Boolean);
    }

    // Add client to the chat
    if (order?.client_id) {
      chatRoomData.client_id = order.client_id._id || order.client_id;
    }

    // Add initial participants if provided
    if (participants && participants.length > 0) {
      for (const participant of participants) {
        const resolvedUser = normalizeParticipantReference(participant);
        if (!resolvedUser?.id) continue;

        const participantEntry = buildParticipantEntry(resolvedUser, adminUser?.id || null);
        if (!participantEntry) continue;

        switch (participant.role) {
          case 'client':
            if (mongoose.Types.ObjectId.isValid(String(resolvedUser.id))) {
              chatRoomData.client_id = resolvedUser.id;
              chatRoomData.client_snapshot = undefined;
            } else {
              participantEntry.role = 'client';
              chatRoomData.client_snapshot = participantEntry;
            }
            break;
          case 'cp':
            participantEntry.decision = 'pending';
            participantEntry.role = 'cp';
            chatRoomData.cp_ids.push(participantEntry);
            break;
          case 'pm':
            chatRoomData.pm_id = resolvedUser.id;
            break;
          case 'production':
            chatRoomData.production_ids = chatRoomData.production_ids || [];
            participantEntry.role = 'production';
            chatRoomData.production_ids.push(participantEntry);
            break;
          case 'admin':
          case 'sales_rep':
          case 'manager':
            // Check if already added as the creating admin
            const existingManager = chatRoomData.manager_ids.find(
              m => String(m.id) === String(resolvedUser.id)
            );
            if (!existingManager) {
              participantEntry.role = participant.role || 'manager';
              chatRoomData.manager_ids.push(participantEntry);
            }
            break;
        }
      }
    }

    const hasMappedParticipants =
      (chatRoomData.manager_ids && chatRoomData.manager_ids.length > 0) ||
      (chatRoomData.cp_ids && chatRoomData.cp_ids.length > 0) ||
      (chatRoomData.production_ids && chatRoomData.production_ids.length > 0) ||
      !!chatRoomData.pm_id ||
      !!chatRoomData.client_id ||
      !!chatRoomData.client_snapshot;

    if (!hasMappedParticipants) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No matching chat users were found in the external system for this project"
      );
    }

    const chatRoom = await ChatRoom.create(chatRoomData);

    // Initialize E2E encryption for this chat room
    // Collect all participant IDs for key distribution
    const allParticipantIds = [];
    if (chatRoomData.client_id) allParticipantIds.push(chatRoomData.client_id.toString());
    if (adminUser?.id && mongoose.Types.ObjectId.isValid(String(adminUser.id))) {
      allParticipantIds.push(String(adminUser.id));
    }
    if (chatRoomData.pm_id && mongoose.Types.ObjectId.isValid(String(chatRoomData.pm_id))) {
      allParticipantIds.push(chatRoomData.pm_id.toString());
    }
    if (chatRoomData.cp_ids) {
      chatRoomData.cp_ids.forEach(cp => {
        if (cp.id && mongoose.Types.ObjectId.isValid(String(cp.id))) {
          allParticipantIds.push(cp.id.toString());
        }
      });
    }
    if (chatRoomData.production_ids) {
      chatRoomData.production_ids.forEach(p => {
        if (p.id && mongoose.Types.ObjectId.isValid(String(p.id))) {
          allParticipantIds.push(p.id.toString());
        }
      });
    }
    if (chatRoomData.manager_ids) {
      chatRoomData.manager_ids.forEach(m => {
        if (m.id && mongoose.Types.ObjectId.isValid(String(m.id))) {
          allParticipantIds.push(m.id.toString());
        }
      });
    }

    // Generate room key and distribute to all participants
    // ✅ VALIDATION: Ensure encryption is set up for ALL participants - fail room creation if it can't be
    if (allParticipantIds.length > 0) {
      try {
        const uniqueParticipantIds = [...new Set(allParticipantIds)];
        const encryptionResult = await encryptionService.initializeRoomEncryption(chatRoom._id, uniqueParticipantIds);
        console.log(`Encryption initialized for chat room ${chatRoom._id} with ${uniqueParticipantIds.length} participants`);

        // ✅ CRITICAL: Warn if some participants don't have encryption (they won't be able to decrypt messages)
        if (encryptionResult.participantsWithoutKeys > 0) {
          console.warn(`⚠️ ${encryptionResult.participantsWithoutKeys} participants do not have encryption enabled - they will NOT be able to see messages`);
          // Note: We don't fail here because the room creator may still want to proceed
          // Participants without encryption simply won't be able to decrypt messages
        }
      } catch (encryptionError) {
        // ✅ CRITICAL: If encryption initialization completely fails, delete the room and fail
        console.error(`❌ Failed to initialize encryption for chat room ${chatRoom._id}:`, encryptionError.message);
        await ChatRoom.findByIdAndDelete(chatRoom._id);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to initialize encryption for chat room: ${encryptionError.message}`);
      }
    }

    return chatRoom;
  } catch (error) {
    throw error;
  }
};

/**
 * Update a chat room by ID with the provided update data.
 */
const updateChatRoom = async (chatRoomId, updateData) => {
  try {
    const updatedChatRoom = await ChatRoom.findByIdAndUpdate(
      chatRoomId,
      updateData,
      { new: true }
    );

    if (!updatedChatRoom) {
      throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
    }

    return updatedChatRoom;
  } catch (error) {
    throw error;
  }
};

/**
 * Update cp_ids in chat room when order is updated
 */
const updateChatRoomWithCpIds = async (orderId, cp_ids) => {
  const existChatRoom = await ChatRoom.findOne({ order_id: orderId });
  try {
    cp_ids?.forEach((updatedCp) => {
      const existingCpIndex = existChatRoom.cp_ids.findIndex(
        (cp) => cp.id.toString() === updatedCp.id
      );
      if (existingCpIndex !== -1) {
        existChatRoom.cp_ids[existingCpIndex].decision = updatedCp.decision;
      } else {
        existChatRoom?.cp_ids.push({
          id: updatedCp.id,
          decision: updatedCp.decision,
        });
      }
    });
    await existChatRoom.save();
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Deletes a chat room and associated messages.
 */
const deleteChatRoom = async (chatRoomId) => {
  try {
    await ChatRoom.findByIdAndDelete(chatRoomId);
    await ChatMessage.deleteMany({ chat_room_id: chatRoomId });
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Checks if a chat room join request is valid.
 */
const isValidJoinRequest = async (chatRoomId) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    return !!chatRoom;
  } catch (error) {
    return false;
  }
};

/**
 * Update chat room status (for shoot lifecycle)
 */
const updateChatRoomStatus = async (chatRoomId, status, adminId, adminName) => {
  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
    }

    const oldStatus = chatRoom.status;
    chatRoom.status = status;
    await chatRoom.save();

    let messageText;
    let messageType;

    if (status === 'archived') {
      messageText = `${adminName} archived this conversation`;
      messageType = 'chat_archived';
    } else if (status === 'read_only') {
      messageText = `${adminName} set this conversation to read-only`;
      messageType = 'chat_archived';
    } else if (status === 'active' && oldStatus !== 'active') {
      messageText = `${adminName} reactivated this conversation`;
      messageType = 'chat_reactivated';
    }

    if (messageText) {
      const systemMessage = await ChatMessage.create({
        chat_room_id: chatRoomId,
        message: messageText,
        message_type: 'system',
        system_message: {
          type: messageType,
          actor_id: adminId,
          actor_name: adminName,
        },
      });

      await updateChatRoom(chatRoomId, { last_message: systemMessage._id });
    }

    return chatRoom;
  } catch (error) {
    throw error;
  }
};

/**
 * Update chat room status based on order status change
 */
const updateChatStatusByOrderStatus = async (orderId, orderStatus) => {
  try {
    const chatRoom = await ChatRoom.findOne({ order_id: orderId });
    if (!chatRoom) {
      return null;
    }

    let newChatStatus = null;
    let messageText = null;
    let messageType = null;

    if (orderStatus === 'cancelled') {
      newChatStatus = 'read_only';
      messageText = 'This conversation has been set to read-only because the shoot was cancelled';
      messageType = 'shoot_cancelled';
    } else if (orderStatus === 'completed' || orderStatus === 'archived') {
      newChatStatus = 'archived';
      messageText = 'This conversation has been archived because the shoot was completed';
      messageType = 'shoot_completed';
    }

    if (newChatStatus && chatRoom.status !== newChatStatus) {
      const oldStatus = chatRoom.status;
      chatRoom.status = newChatStatus;
      await chatRoom.save();

      if (messageText) {
        const systemMessage = await ChatMessage.create({
          chat_room_id: chatRoom._id,
          message: messageText,
          message_type: 'system',
          system_message: {
            type: messageType,
            previous_status: oldStatus,
            new_status: newChatStatus,
          },
        });

        await updateChatRoom(chatRoom._id, { last_message: systemMessage._id });
      }

      console.log(`Chat room ${chatRoom._id} status updated to ${newChatStatus} due to order status: ${orderStatus}`);
      return chatRoom;
    }

    return null;
  } catch (error) {
    console.error(`Error updating chat status for order ${orderId}:`, error.message);
    return null;
  }
};

module.exports = {
  getChatRooms,
  getChatRoomById,
  getChatRoomByOrderId,
  getChatRoomByUserId,
  createChatRoom,
  updateChatRoom,
  updateChatRoomWithCpIds,
  deleteChatRoom,
  isValidJoinRequest,
  updateChatRoomStatus,
  updateChatStatusByOrderStatus,
};
