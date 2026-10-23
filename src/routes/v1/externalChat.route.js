const express = require("express");
const chatController = require("../../controllers/chat.controller");
const { chatService } = require("../../services");
const { getIO, notifyAllParticipants } = require("../../services/socket.service");

const router = express.Router();

const getPlainRoom = (room) => {
  if (!room) return room;
  if (typeof room.toJSON === "function") return room.toJSON({ flattenMaps: true });
  if (typeof room.toObject === "function") return room.toObject({ flattenMaps: true });
  return room;
};

const normalizeParticipantId = (value) => {
  const rawId = value && typeof value === "object"
    ? (value.id || value._id || value.user_id || value.userId || value.client_id || value.clientId || value.crew_member_id || value.crewMemberId)
    : value;
  const id = String(rawId || "").trim();
  return id || null;
};

const getParticipantNotificationIds = (value) => {
  if (!value) return [];

  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id ? [id] : [];
  }

  const ids = [
    value.id,
    value._id,
    value.user_id,
    value.userId,
    value.client_id,
    value.clientId,
    value.crew_member_id,
    value.crewMemberId,
    value.email,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  return ids;
};

const getRoomParticipantIds = (room) => {
  const plainRoom = getPlainRoom(room) || {};
  const participantIds = new Set();

  [
    plainRoom.client_id,
    plainRoom.client_snapshot,
    plainRoom.pm_id,
    ...(Array.isArray(plainRoom.cp_ids) ? plainRoom.cp_ids : []),
    ...(Array.isArray(plainRoom.manager_ids) ? plainRoom.manager_ids : []),
    ...(Array.isArray(plainRoom.production_ids) ? plainRoom.production_ids : []),
  ].forEach((participant) => {
    getParticipantNotificationIds(participant).forEach((id) => participantIds.add(id));
  });

  return [...participantIds];
};

// Keeps only mentions that match a real participant of the room (by id or email).
// Self-mentions and duplicates are dropped. Client-supplied names are never trusted for identity.
const resolveRoomMentions = (room, rawMentions, senderId, senderEmail) => {
  if (!Array.isArray(rawMentions) || !rawMentions.length) return [];

  const plainRoom = getPlainRoom(room) || {};
  const roomParticipants = [
    plainRoom.client_id,
    plainRoom.client_snapshot,
    plainRoom.pm_id,
    ...(Array.isArray(plainRoom.client_ids) ? plainRoom.client_ids : []),
    ...(Array.isArray(plainRoom.cp_ids) ? plainRoom.cp_ids : []),
    ...(Array.isArray(plainRoom.manager_ids) ? plainRoom.manager_ids : []),
    ...(Array.isArray(plainRoom.production_ids) ? plainRoom.production_ids : []),
  ].filter(Boolean);

  const self = new Set(
    [senderId, senderEmail].map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
  );
  const seen = new Set();
  const result = [];

  rawMentions.forEach((item) => {
    const requestedId = String(
      item?.id ?? item?.user_id ?? (typeof item === "object" ? "" : item) ?? ""
    ).trim();
    const requestedIdKey = requestedId.toLowerCase();
    const requestedAliases = (Array.isArray(item?.aliases) ? item.aliases : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    const requestedEmail = String(item?.email || "").trim().toLowerCase();
    if (!requestedIdKey && !requestedEmail) return;

    // Resolve client supplied identifiers back to a room participant. Never persist
    // an arbitrary id or display name supplied by the message sender.
    // Emails identify the selected person across legacy ID namespaces. Then
    // match the canonical participant ID. Alias IDs are only a last resort
    // when no email was supplied; client_id/crew_member_id can collide with
    // another user's platform ID.
    const participantByEmail = requestedEmail
      ? roomParticipants.find((candidate) => {
        const email = typeof candidate === "object" ? candidate?.email : candidate;
        return String(email || "").trim().toLowerCase() === requestedEmail;
      })
      : null;
    const participantByCanonicalId = requestedIdKey
      ? roomParticipants.find((candidate) => normalizeParticipantId(candidate)?.toLowerCase() === requestedIdKey)
      : null;
    const participantByAlias = !requestedEmail && requestedAliases.length
      ? roomParticipants.find((candidate) => {
          const participantIds = getParticipantNotificationIds(candidate).map((v) => v.toLowerCase());
          return requestedAliases.some((id) => participantIds.includes(id));
      })
      : null;
    const participant = participantByEmail || participantByCanonicalId || participantByAlias;
    if (!participant) return;

    // The upstream API validates the email and sends the canonical participant
    // ID. Keep that ID when an older room snapshot has a different legacy ID.
    const id = participantByEmail && requestedId ? requestedId : normalizeParticipantId(participant);
    const idKey = String(id || "").toLowerCase();
    const email = String(participant?.email || (typeof participant === "string" && participant.includes("@") ? participant : "")).trim().toLowerCase();
    const identityKey = email ? `email:${email}` : `id:${idKey}`;
    if (!id || self.has(idKey) || (email && self.has(email)) || seen.has(identityKey)) return;
    seen.add(identityKey);
    result.push({
      user_id: id,
      name: String(participant?.name || item?.name || "").trim().slice(0, 120) || email || id,
      email: email || null,
    });
  });

  return result;
};

const mentionsPresentInText = (mentions, text) => {
  const message = String(text || "");
  const includesAllMention = /(^|\s)@(?:all|everyone)(?![\p{L}\p{N}_])/iu.test(message);
  return (Array.isArray(mentions) ? mentions : []).filter((mention) => {
    if (includesAllMention) return true;
    const name = String(mention?.name || "").trim();
    if (!name) return false;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`@${escapedName}(?![\\p{L}\\p{N}_])`, "u").test(message);
  });
};

const emitExternalChatRoomCreated = ({ chatRoom, createdBy }) => {
  const io = getIO();
  const room = getPlainRoom(chatRoom);
  const roomId = normalizeParticipantId(room);
  if (!io || !roomId || !room) return;

  const payload = {
    success: true,
    type: "addedToChat",
    event: "chatRoomCreated",
    roomId,
    chatRoomId: roomId,
    orderId: room.order_id ? String(room.order_id) : undefined,
    externalOrderRef: room.external_order_ref || undefined,
    name: room.name || "",
    room,
    createdBy: createdBy || null,
    createdAt: room.createdAt || new Date().toISOString(),
  };

  getRoomParticipantIds(room).forEach((userId) => {
    const userRoom = `user_${userId}`;
    io.to(userRoom).emit("chatRoomCreated", payload);
    io.to(userRoom).emit("notification:new", payload);
  });

  io.emit("updateChatRoom", {
    roomId,
    chatRoomId: roomId,
    type: "chatRoomCreated",
    success: true,
  });
};

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
    mentions: Array.isArray(savedMessage.mentions) ? savedMessage.mentions : [],
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
    mentions: Array.isArray(updatedMessage.mentions) ? updatedMessage.mentions : [],
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

const emitExternalChatMessagesDeleted = ({ roomId, messageIds, updatedAt }) => {
  const io = getIO();
  const ids = Array.isArray(messageIds) ? messageIds.map(String).filter(Boolean) : [];
  if (!io || !roomId || !ids.length) return;

  io.to(String(roomId)).emit("messagesDeleted", {
    success: true,
    roomId: String(roomId),
    messageIds: ids,
    updatedAt: updatedAt || new Date().toISOString(),
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

const emitExternalChatRoomStatusChanged = ({ chatRoom, status }) => {
  const io = getIO();
  const room = getPlainRoom(chatRoom);
  const roomId = normalizeParticipantId(room);
  if (!io || !roomId) return;

  const payload = {
    success: true,
    roomId,
    chatRoomId: roomId,
    status,
    updatedAt: new Date().toISOString(),
  };

  io.to(roomId).emit("chatRoomStatusChanged", payload);
  getRoomParticipantIds(room).forEach((userId) => {
    io.to(`user_${userId}`).emit("chatRoomStatusChanged", payload);
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
router.get("/digest-candidates", async (req, res) => {
  try {
    const candidates = await chatService.getEmailDigestCandidates(req.query.since);
    return res.status(200).send({ results: candidates });
  } catch (error) {
    return res.status(error.statusCode || 500).send({ success: false, message: error.message || 'Failed to load chat email digest candidates' });
  }
});
router.post("/room", async (req, res) => {
  try {
    const chatRoom = await chatService.createChatRoom(req.body, req.body.adminUser || req.body.adminId || null);
    emitExternalChatRoomCreated({
      chatRoom,
      createdBy: req.body.adminUser || req.body.adminId || null,
    });
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
    const { role, participants, user_ids, silent } = req.body;
    if (!role) {
      return res.status(400).send({
        success: false,
        message: "Role is required",
      });
    }

    const result = await chatService.addParticipants(
      req.params.roomId,
      { role, participants, user_ids, silent: silent === true },
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
    const senderId = sender.id ? String(sender.id) : null;
    const senderName = sender.name || sender.email || "Beige User";
    const replyTo = req.body.replyTo ? String(req.body.replyTo) : null;
    const mentions = mentionsPresentInText(
      resolveRoomMentions(room, req.body.mentions, senderId, sender.email),
      message
    );
    const payload = {
      chat_room_id: req.params.roomId,
      message,
      sent_by: senderId,
      sent_by_name: senderName,
      sent_by_email: sender.email || null,
      message_type: "text",
      status: "Sent",
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(mentions.length ? { mentions } : {}),
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
      message,
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

    const previous = await chatService.getMessageById(req.params.messageId);
    const sender = req.body.sender || {};
    const room = await chatService.getChatRoomById(String(previous?.chat_room_id || req.body.roomId || ""));
    const mentions = Array.isArray(req.body.mentions)
      ? mentionsPresentInText(
        resolveRoomMentions(room, req.body.mentions, String(editorId), sender.email),
        content
      )
      : undefined;
    const mentionIdentity = (mention) => {
      const email = String(mention?.email || "").trim().toLowerCase();
      return email ? `email:${email}` : `id:${String(mention?.user_id || "")}`;
    };
    const previousMentionIdentities = new Set((previous?.mentions || []).map(mentionIdentity));
    const newlyMentionedUsers = (mentions || [])
      .filter((mention) => !previousMentionIdentities.has(mentionIdentity(mention)))
      .map((mention) => ({ id: String(mention.user_id), email: mention.email || null }));
    const updated = await chatService.editMessage(req.params.messageId, content, String(editorId), null, mentions);
    const roomId = String(
      updated?.chat_room_id || updated?.chatRoomId || req.body.roomId || req.body.chat_room_id || ""
    );
    emitExternalChatMessageEdited({ roomId, updatedMessage: updated });
    return res.status(200).send({
      success: true,
      data: updated,
      newlyMentionedUsers,
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

    const updated = await chatService.softDeleteMessage(req.params.messageId, String(deleterId), {
      allowAnySender: Boolean(req.body.allowAnySender),
    });
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

const batchDeleteMessagesHandler = async (req, res) => {
  try {
    const roomId = String(req.params.roomId || "").trim();
    const deleterId = req.body.sender?.id || req.body.userId;
    const messageIds = Array.isArray(req.body.messageIds)
      ? [...new Set(req.body.messageIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];

    if (!roomId) {
      return res.status(400).send({ success: false, message: "Room id is required" });
    }
    if (!deleterId) {
      return res.status(400).send({ success: false, message: "User id is required" });
    }
    if (!messageIds.length) {
      return res.status(400).send({ success: false, message: "messageIds are required" });
    }
    if (messageIds.length > 100) {
      return res.status(400).send({ success: false, message: "You can delete at most 100 messages at once" });
    }

    const result = await chatService.softDeleteMessages(roomId, messageIds, String(deleterId), {
      allowAnySender: Boolean(req.body.allowAnySender),
    });

    emitExternalChatMessagesDeleted({
      roomId,
      messageIds: result.deletedIds,
      updatedAt: result.updatedAt,
    });

    return res.status(200).send({
      success: true,
      data: {
        deletedIds: result.deletedIds,
        skippedIds: result.skippedIds,
        updatedAt: result.updatedAt,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to delete messages",
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
router.post("/room/:roomId/messages/batch-delete", batchDeleteMessagesHandler);
router.post("/messages/:messageId/reaction", reactionHandler);
router.get("/participants/:roomId", chatController.getChatParticipants);
router.patch("/rooms/:roomId/status", async (req, res) => {
  try {
    const status = String(req.body.status || "").trim().toLowerCase();
    if (!["active", "read_only", "archived"].includes(status)) {
      return res.status(400).send({
        success: false,
        message: "Valid status is required (active, read_only, archived)",
      });
    }

    const adminId = req.body.adminUser?.id || req.body.adminId || "beige-admin";
    const adminName = req.body.adminUser?.name || req.body.sender?.name || "Beige Admin";

    const chatRoom = await chatService.updateChatRoomStatus(
      String(req.params.roomId),
      status,
      String(adminId),
      adminName
    );

    emitExternalChatRoomStatusChanged({ chatRoom, status });

    return res.status(200).send({
      success: true,
      data: getPlainRoom(chatRoom),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).send({
      success: false,
      message: error.message || "Failed to update chat status",
    });
  }
});
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
