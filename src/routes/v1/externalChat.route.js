const express = require("express");
const chatController = require("../../controllers/chat.controller");
const { chatService } = require("../../services");

const router = express.Router();

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

    const message = String(req.body.message || "").trim();
    if (!message) {
      return res.status(400).send({
        success: false,
        message: "Message is required",
      });
    }

    const sender = req.body.sender || {};
    const replyTo = req.body.replyTo ? String(req.body.replyTo) : null;
    const payload = {
      chat_room_id: req.params.roomId,
      message,
      sent_by: sender.id ? String(sender.id) : null,
      sent_by_name: sender.name || sender.email || "Beige User",
      sent_by_email: sender.email || null,
      message_type: "text",
      status: "Sent",
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    const saved = replyTo ? await chatService.sendReplyMessage(payload) : await chatService.saveChatRoomMessage(payload);

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

module.exports = router;
