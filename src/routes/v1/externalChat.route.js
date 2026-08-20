const express = require("express");
const chatController = require("../../controllers/chat.controller");
const { chatService } = require("../../services");
const { getIO, notifyAllParticipants } = require("../../services/socket.service");

const router = express.Router();

const emitExternalChatMessage = ({ roomId, savedMessage, senderId, senderName }) => {
  const io = getIO();
  if (!io || !roomId || !savedMessage) return;

  const messageId = String(savedMessage._id || savedMessage.id || "");
  const createdAt = savedMessage.createdAt || savedMessage.updatedAt || new Date().toISOString();
  const preview = savedMessage.message || savedMessage.file_name || "New message";

  io.to(String(roomId)).emit("message", {
    roomId: String(roomId),
    senderId: senderId ? String(senderId) : undefined,
    senderName: senderName || "Beige User",
    messageId,
    message: savedMessage.message || "",
    fileUrl: savedMessage.file_url || null,
    fileName: savedMessage.file_name || null,
    fileType: savedMessage.file_type || null,
    message_type: savedMessage.message_type || "text",
    createdAt,
    updatedAt: savedMessage.updatedAt || createdAt,
    replyTo: savedMessage.reply_to || null,
    success: true,
  });

  io.emit("updateChatRoom", {
    roomId: String(roomId),
    message: preview,
    success: true,
  });
};

const emitExternalChatMessageEdited = ({ roomId, updatedMessage }) => {
  const io = getIO();
  if (!io || !roomId || !updatedMessage) return;

  const messageId = String(updatedMessage._id || updatedMessage.id || "");
  io.to(String(roomId)).emit("messageEdited", {
    success: true,
    roomId: String(roomId),
    messageId,
    content: updatedMessage.message || "",
    updatedAt: updatedMessage.updatedAt || new Date().toISOString(),
    is_edited: true,
  });
};

const emitExternalChatMessageDeleted = ({ roomId, updatedMessage, messageId }) => {
  const io = getIO();
  if (!io || !roomId || !(updatedMessage || messageId)) return;

  const resolvedMessageId = String(messageId || updatedMessage?._id || updatedMessage?.id || "");
  io.to(String(roomId)).emit("messageDeleted", {
    success: true,
    roomId: String(roomId),
    messageId: resolvedMessageId,
    updatedAt: updatedMessage?.updatedAt || new Date().toISOString(),
    is_deleted: true,
  });
};

const emitExternalChatReactionUpdated = ({ roomId, updatedMessage }) => {
  const io = getIO();
  if (!io || !roomId || !updatedMessage) return;

  const messageId = String(updatedMessage._id || updatedMessage.id || "");
  io.to(String(roomId)).emit("reactionUpdated", {
    success: true,
    roomId: String(roomId),
    messageId,
    reactions: Array.isArray(updatedMessage.reactions) ? updatedMessage.reactions : [],
    updatedAt: updatedMessage.updatedAt || new Date().toISOString(),
  });
};

const requireInternalKey = (req, res, next) => {
  const providedKey = req.headers["x-internal-key"];
  const expectedKey = process.env.INTERNAL_CHAT_KEY || process.env.INTERNAL_FILE_MANAGER_KEY || "beige-internal-dev-key";

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      message: "Invalid internal integration key",
    });
  }

  return next();
};

router.use(requireInternalKey);

router.get("/rooms", chatController.getChatRooms);
router.post("/room", async (req, res) => {
  try {
    const chatRoom = await chatService.createChatRoom(req.body, req.body.adminUser || req.body.adminId || null);
    res.status(201).send(chatRoom);
  } catch (error) {
    res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to create chat room",
    });
  }
});
router.get("/order/:orderId", chatController.getChatRoomByOrderId);
router.get("/room/:roomId", chatController.getChatRoomById);
router.post("/participants/:roomId", async (req, res) => {
  try {
    const { role, participants, user_ids } = req.body;
    if (!role) {
      return res.status(400).send({
        success: false,
        message: "Role is required",
      });
    }

    const result = await chatService.addParticipants(
      req.params.roomId,
      { role, participants, user_ids },
      req.body.adminUser?.id || req.body.adminId || "beige-admin",
      req.body.adminUser?.name || "Beige Admin"
    );

    return res.status(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to add participants",
    });
  }
});
router.delete("/participants/:roomId/:userId", async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!role) {
      return res.status(400).send({
        success: false,
        message: "Role is required",
      });
    }

    const result = await chatService.removeParticipant(
      req.params.roomId,
      String(req.params.userId),
      String(role),
      req.body.adminUser?.id || req.body.adminId || "beige-admin",
      req.body.adminUser?.name || "Beige Admin"
    );

    return res.status(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to remove participant",
    });
  }
});
router.post("/messages/:roomId", async (req, res) => {
  try {
    const room = await chatService.getChatRoomById(req.params.roomId);
    if (!room) {
      return res.status(404).send({
        success: false,
        message: "Chat room not found",
      });
    }

    const fileUrl = String(req.body.fileUrl || req.body.file_url || "").trim();
    const fileName = String(req.body.fileName || req.body.file_name || "").trim();
    const fileType = String(req.body.fileType || req.body.file_type || "").trim();
    const messageType = String(req.body.messageType || req.body.message_type || "").trim().toLowerCase();
    const message = String(req.body.message || "").trim();
    if (!message && !fileUrl) {
      return res.status(400).send({
        success: false,
        message: "Message or file is required",
      });
    }

    const sender = req.body.sender || {};
    const senderId = sender.id ? String(sender.id) : null;
    const senderName = sender.name || sender.email || "Beige User";
    const replyTo = req.body.replyTo ? String(req.body.replyTo) : null;
    const resolvedMessageType = messageType || (fileUrl ? (fileType.startsWith("image/") ? "image" : "file") : "text");
    const payload = {
      chat_room_id: req.params.roomId,
      message,
      sent_by: senderId,
      sent_by_name: senderName,
      sent_by_email: sender.email || null,
      message_type: resolvedMessageType,
      status: "Sent",
      ...(fileUrl ? {
        file_url: fileUrl,
        file_name: fileName || message || "Shared file",
        file_type: fileType || null,
      } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    const saved = replyTo ? await chatService.sendReplyMessage(payload) : await chatService.saveChatRoomMessage(payload);

    emitExternalChatMessage({
      roomId: req.params.roomId,
      savedMessage: saved,
      senderId,
      senderName,
    });

    notifyAllParticipants(
      String(req.params.roomId),
      senderId ? String(senderId) : "",
      senderName,
      message || (fileUrl ? "Attachment" : ""),
      String(saved?._id || saved?.id || "")
    ).catch(() => undefined);

    return res.status(201).send({
      success: true,
      data: saved,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to send message",
    });
  }
});
router.get("/messages/:roomId", (req, res, next) => {
  req.params.id = req.params.roomId;
  return chatController.getChatsByRoomId(req, res, next);
});
const editMessageHandler = async (req, res) => {
  try {
    const content = String(req.body.content || "").trim();
    if (!content) {
      return res.status(400).send({
        success: false,
        message: "Message content is required",
      });
    }

    const editorId = req.body.sender?.id || req.body.userId;
    if (!editorId) {
      return res.status(400).send({
        success: false,
        message: "User id is required",
      });
    }

    const updated = await chatService.editMessage(req.params.messageId, content, String(editorId));
    const roomId = String(
      updated?.chat_room_id || updated?.chatRoomId || req.body.roomId || req.body.chat_room_id || ""
    );
    emitExternalChatMessageEdited({ roomId, updatedMessage: updated });
    return res.status(200).send({
      success: true,
      data: updated,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to edit message",
    });
  }
};

const deleteMessageHandler = async (req, res) => {
  try {
    const deleterId = req.body.sender?.id || req.body.userId;
    if (!deleterId) {
      return res.status(400).send({
        success: false,
        message: "User id is required",
      });
    }

    const updated = await chatService.softDeleteMessage(req.params.messageId, String(deleterId));
    const roomId = String(
      updated?.chat_room_id || updated?.chatRoomId || req.body.roomId || req.body.chat_room_id || ""
    );
    emitExternalChatMessageDeleted({
      roomId,
      updatedMessage: updated,
      messageId: req.params.messageId,
    });
    return res.status(200).send({
      success: true,
      data: updated,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to delete message",
    });
  }
};

const reactionHandler = async (req, res) => {
  try {
    const emoji = String(req.body.emoji || "").trim();
    if (!emoji) {
      return res.status(400).send({
        success: false,
        message: "Emoji is required",
      });
    }

    const sender = req.body.sender || {};
    const reactorId = sender.id || req.body.userId;
    if (!reactorId) {
      return res.status(400).send({
        success: false,
        message: "User id is required",
      });
    }

    const updated = await chatService.addReaction(
      req.params.messageId,
      emoji,
      String(reactorId),
      sender.name || sender.email || "Beige User"
    );
    const roomId = String(
      updated?.chat_room_id || updated?.chatRoomId || req.body.roomId || req.body.chat_room_id || ""
    );
    emitExternalChatReactionUpdated({ roomId, updatedMessage: updated });
    return res.status(200).send({
      success: true,
      data: updated,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to react to message",
    });
  }
};

router.patch("/messages/:messageId/edit", editMessageHandler);
router.post("/messages/:messageId/edit", editMessageHandler);
router.patch("/messages/:messageId/delete", deleteMessageHandler);
router.post("/messages/:messageId/delete", deleteMessageHandler);
router.post("/messages/:messageId/reaction", reactionHandler);
router.get("/participants/:roomId", chatController.getChatParticipants);
router.patch("/rooms/:roomId/mark-read", async (req, res) => {
  try {
    const userId = String(req.body.userId || req.body.sender?.id || "").trim();
    if (!userId) {
      return res.status(400).send({
        success: false,
        message: "User id is required",
      });
    }

    const result = await chatService.markMessagesAsRead(String(req.params.roomId), userId);
    return res.status(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to mark messages as read",
    });
  }
});

module.exports = router;
