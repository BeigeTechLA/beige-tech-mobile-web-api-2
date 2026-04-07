/**
 * Chat Message Service
 * Handles message CRUD operations, reactions, and replies
 */

const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { ChatRoom, ChatMessage, User } = require("../../models");
const ApiError = require("../../utils/ApiError");

const toSenderPayload = async (value, fallbackName = null, fallbackEmail = null) => {
  if (!value && !fallbackName && !fallbackEmail) return null;

  const senderId = value != null ? String(value) : "";
  if (senderId && mongoose.Types.ObjectId.isValid(senderId)) {
    const user = await User.findById(senderId).select('_id name email profile_picture isActive').lean();
    if (user) {
      return {
        ...user,
        id: user._id?.toString() || senderId,
      };
    }
  }

  return {
    id: senderId || fallbackEmail || fallbackName || "external-user",
    name: fallbackName || fallbackEmail || senderId || "Participant",
    email: fallbackEmail || null,
  };
};

const hydrateMessageSender = async (message) => {
  const msgObj = message?.toObject ? message.toObject() : message;
  if (!msgObj) return msgObj;

  msgObj.sent_by = await toSenderPayload(msgObj.sent_by, msgObj.sent_by_name, msgObj.sent_by_email);

  if (msgObj.reply_to?.sent_by || msgObj.reply_to?.sent_by_name || msgObj.reply_to?.sent_by_email) {
    msgObj.reply_to.sent_by = await toSenderPayload(
      msgObj.reply_to.sent_by,
      msgObj.reply_to.sent_by_name,
      msgObj.reply_to.sent_by_email
    );
  }

  return msgObj;
};

/**
 * Retrieve chats for a specific chat room based on the provided options.
 * For removed participants, only returns messages up to their last_visible_message.
 */
const getChatsByRoomId = async (options, chatRoomId, userId = null) => {
  const filter = {};
  filter.chat_room_id = chatRoomId;
  options.sortBy = "createdAt:desc";
  options.populate = "reply_to";

  try {
    if (userId) {
      const chatRoom = await ChatRoom.findById(chatRoomId);
      if (chatRoom && chatRoom.removed_participants) {
        const removedParticipant = chatRoom.removed_participants.find(
          (rp) => rp.user_id && rp.user_id.toString() === userId.toString()
        );

        if (removedParticipant) {
          console.log('🔒 User is a removed participant:', {
            userId,
            removed_at: removedParticipant.removed_at,
            last_visible_message: removedParticipant.last_visible_message
          });

          if (removedParticipant.last_visible_message) {
            const lastVisibleMsg = await ChatMessage.findById(removedParticipant.last_visible_message);
            if (lastVisibleMsg) {
              console.log('🔒 Filtering messages up to:', lastVisibleMsg.createdAt);
              filter.createdAt = { $lte: lastVisibleMsg.createdAt };
            } else {
              console.log('🔒 last_visible_message not found in DB, using removed_at');
              filter.createdAt = { $lt: removedParticipant.removed_at };
            }
          } else if (removedParticipant.removed_at) {
            console.log('🔒 No last_visible_message, using removed_at:', removedParticipant.removed_at);
            filter.createdAt = { $lt: removedParticipant.removed_at };
          }
        }
      }
    }

    console.log('🔒 Final message filter:', JSON.stringify(filter));

    const result = await ChatMessage.paginate(filter, options);

    // Per PRD: Deactivated users should appear as "Inactive User" in chat history
    if (result && result.results) {
      result.results = await Promise.all(result.results.map(async (msg) => {
        const msgObj = await hydrateMessageSender(msg);
        if (msgObj.sent_by && typeof msgObj.sent_by === "object" && msgObj.sent_by.isActive === false) {
          msgObj.sent_by = {
            ...msgObj.sent_by,
            name: 'Inactive User',
            _originalName: msgObj.sent_by.name,
          };
        }
        return msgObj;
      }));
    }

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get chat files by room ID
 */
const getChatFilesByRoomId = async (options, chatRoomId) => {
  const filter = {};
  filter.chat_room_id = chatRoomId;

  const fileExtensionsRegex =
    /\.(jpg|jpeg|png|gif|bmp|tiff|webp|mp4|mkv|avi|mov|wmv|mp3|wav|flac|ogg|pdf|docx|xlsx|pptx|txt|zip|rar|tar|7z|exe|json|csv|xml)$/i;

  filter.message = { $regex: fileExtensionsRegex };
  options.sortBy = "createdAt:desc";
  options.populate = "sent_by";

  try {
    return await ChatMessage.paginate(filter, options);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Saves a chat room message.
 */
const saveChatRoomMessage = async (insertObject) => {
  try {
    const message = await ChatMessage.create(insertObject);
    const chatRoomId = message.chat_room_id;
    const messageId = message._id;

    await ChatRoom.findByIdAndUpdate(
      chatRoomId,
      { last_message: new mongoose.Types.ObjectId(messageId) },
      { new: true }
    );

    return hydrateMessageSender(message);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Updates the status of a chat room message.
 */
const updateMessageStatus = async (messageUpdateObject) => {
  const { senderId, messageId, messageStatus } = messageUpdateObject;
  try {
    return ChatMessage.findOneAndUpdate(
      { _id: messageId, sent_by: senderId },
      { status: messageStatus },
      { new: true }
    );
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Deletes a chat message.
 */
const deleteChatMessage = async (chatMessageId) => {
  try {
    await ChatMessage.findByIdAndDelete(chatMessageId);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Edit a message (Admin only)
 * @param {string} messageId - Message ID
 * @param {string} newContent - New message content (or "[Encrypted]" for E2E)
 * @param {string} editedBy - User ID of editor
 * @param {Object} encryptedContent - Optional E2E encrypted content
 */
const editMessage = async (messageId, newContent, editedBy, encryptedContent = null) => {
  try {
    const message = await ChatMessage.findById(messageId);
    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, "Message not found");
    }

    if (message.is_deleted) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Cannot edit a deleted message");
    }

    if (message.message_type === 'system') {
      throw new ApiError(httpStatus.BAD_REQUEST, "Cannot edit system messages");
    }

    message.message = newContent;
    message.is_edited = true;
    message.edited_at = new Date();
    message.edited_by = editedBy;

    // Update encrypted content if provided
    if (encryptedContent) {
      message.encrypted_content = encryptedContent;
      message.is_encrypted = true;
    }

    await message.save();
    return message;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Soft delete a message (Admin only)
 */
const softDeleteMessage = async (messageId, deletedBy) => {
  try {
    const message = await ChatMessage.findById(messageId);
    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, "Message not found");
    }

    if (message.is_deleted) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Message is already deleted");
    }

    if (message.message_type === 'system') {
      throw new ApiError(httpStatus.BAD_REQUEST, "Cannot delete system messages");
    }

    message.is_deleted = true;
    message.deleted_at = new Date();
    message.deleted_by = deletedBy;

    await message.save();
    return message;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Add a reaction to a message
 */
const addReaction = async (messageId, emoji, userId, userName) => {
  try {
    const message = await ChatMessage.findById(messageId);
    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, "Message not found");
    }

    if (message.is_deleted) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Cannot react to a deleted message");
    }

    if (!message.reactions) {
      message.reactions = [];
    }

    const existingSameEmoji = message.reactions.find(
      r => r.user_id.toString() === userId.toString() && r.emoji === emoji
    );

    if (existingSameEmoji) {
      message.reactions = message.reactions.filter(
        r => !(r.user_id.toString() === userId.toString() && r.emoji === emoji)
      );
    } else {
      message.reactions = message.reactions.filter(
        r => r.user_id.toString() !== userId.toString()
      );
      message.reactions.push({
        emoji,
        user_id: userId,
        user_name: userName,
        created_at: new Date()
      });
    }

    await message.save();
    return message;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Send a reply to a message
 */
const sendReplyMessage = async (messageData) => {
  try {
    if (messageData.reply_to) {
      const parentMessage = await ChatMessage.findById(messageData.reply_to);
      if (!parentMessage) {
        throw new ApiError(httpStatus.NOT_FOUND, "Reply target message not found");
      }
      if (parentMessage.is_deleted) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Cannot reply to a deleted message");
      }
    }

    const message = await ChatMessage.create(messageData);
    await message.populate({
      path: 'reply_to',
      select: 'message sent_by sent_by_name sent_by_email message_type file_name',
    });

    return hydrateMessageSender(message);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get a single message by ID with populated fields
 */
const getMessageById = async (messageId) => {
  try {
    const message = await ChatMessage.findById(messageId).populate({
      path: 'reply_to',
      select: 'message sent_by sent_by_name sent_by_email message_type file_name',
    });

    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, "Message not found");
    }

    return hydrateMessageSender(message);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

module.exports = {
  getChatsByRoomId,
  getChatFilesByRoomId,
  saveChatRoomMessage,
  updateMessageStatus,
  deleteChatMessage,
  editMessage,
  softDeleteMessage,
  addReaction,
  sendReplyMessage,
  getMessageById,
};
