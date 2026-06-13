/**
 * Chat Message Service
 * Handles message CRUD operations, reactions, and replies
 */

const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { ChatRoom, ChatMessage, User } = require("../../models");
const ApiError = require("../../utils/ApiError");
const sendgridService = require("../sendgrid.service");
const { MESSAGING_INITIATED_TEMPLATE_ID } = require("../../config/sendgridTemplates");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const pushRecipientEmail = (recipientMap, email, fallback = {}) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (!recipientMap.has(normalized)) {
    recipientMap.set(normalized, {
      email: normalized,
      name: String(fallback.name || "").trim() || "Team Member",
      role: String(fallback.role || "").trim() || null,
    });
  }
};

const collectAllChatParticipantRefs = (chatRoom = {}) => {
  const refs = [];

  if (chatRoom.client_id) refs.push({ id: chatRoom.client_id, role: "client" });
  if (chatRoom.pm_id) refs.push({ id: chatRoom.pm_id, role: "pm" });
  (chatRoom.cp_ids || []).forEach((cp) => refs.push({ id: cp?.id, email: cp?.email, name: cp?.name, role: "cp" }));
  (chatRoom.manager_ids || []).forEach((m) =>
    refs.push({ id: m?.id, email: m?.email, name: m?.name, role: m?.role || "manager" })
  );
  (chatRoom.production_ids || []).forEach((p) =>
    refs.push({ id: p?.id, email: p?.email, name: p?.name, role: p?.role || "production" })
  );
  if (chatRoom.client_snapshot?.email || chatRoom.client_snapshot?.id) {
    refs.push({
      id: chatRoom.client_snapshot?.id,
      email: chatRoom.client_snapshot?.email,
      name: chatRoom.client_snapshot?.name,
      role: "client",
    });
  }

  return refs;
};

const sendMessageCreatedTemplateEmail = async ({ chatRoomId, senderId, senderName, messagePreview }) => {
  try {
    if (!MESSAGING_INITIATED_TEMPLATE_ID) return;

    const chatRoom = await ChatRoom.findById(chatRoomId).lean();
    if (!chatRoom) return;

    const senderIdStr = String(senderId || "");
    let senderEmail = "";
    if (senderIdStr && mongoose.Types.ObjectId.isValid(senderIdStr)) {
      const senderDoc = await User.findById(senderIdStr).select("email").lean();
      senderEmail = normalizeEmail(senderDoc?.email || "");
    }

    const refs = collectAllChatParticipantRefs(chatRoom);
    const mongoUserIds = [...new Set(
      refs
        .map((item) => String(item?.id || "").trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id) && id !== senderIdStr)
    )];

    const users = mongoUserIds.length
      ? await User.find({ _id: { $in: mongoUserIds } }).select("name email role").lean()
      : [];

    const recipientMap = new Map();
    users.forEach((user) => {
      pushRecipientEmail(recipientMap, user?.email, {
        name: user?.name,
        role: user?.role,
      });
    });

    refs.forEach((ref) => {
      const refId = String(ref?.id || "").trim();
      if (refId && refId === senderIdStr) return;
      const normalizedRefEmail = normalizeEmail(ref?.email || "");
      if (!normalizedRefEmail || normalizedRefEmail === senderEmail) return;
      pushRecipientEmail(recipientMap, normalizedRefEmail, {
        name: ref?.name,
        role: ref?.role,
      });
    });

    const recipients = Array.from(recipientMap.values()).map((item) => item.email);
    if (!recipients.length) return;

    await sendgridService.sendDynamicTemplateEmail({
      to: recipients,
      templateId: MESSAGING_INITIATED_TEMPLATE_ID,
      dynamicTemplateData: {
        chat_room_id: String(chatRoom?._id || chatRoomId),
        chat_name: String(chatRoom?.name || ""),
        order_id: String(chatRoom?.order_id || ""),
        sender_id: senderIdStr,
        sender_name: String(senderName || "Beige User"),
        message_preview: String(messagePreview || "").slice(0, 250),
        sent_at: new Date().toISOString(),
        event_type: "message_created",
      },
    });
  } catch (error) {
    // Keep chat delivery non-blocking even if email fails
    console.warn("[chat] message template email failed:", error?.message || error);
  }
};

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

    const hydrated = await hydrateMessageSender(message);
    await sendMessageCreatedTemplateEmail({
      chatRoomId,
      senderId: insertObject?.sent_by,
      senderName: hydrated?.sent_by?.name || insertObject?.sent_by_name || "Beige User",
      messagePreview: insertObject?.message || insertObject?.file_name || "New chat message",
    });

    return hydrated;
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

    const hydrated = await hydrateMessageSender(message);
    await sendMessageCreatedTemplateEmail({
      chatRoomId: messageData?.chat_room_id,
      senderId: messageData?.sent_by,
      senderName: hydrated?.sent_by?.name || messageData?.sent_by_name || "Beige User",
      messagePreview: messageData?.message || messageData?.file_name || "New chat reply",
    });

    return hydrated;
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
