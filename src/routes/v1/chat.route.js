const express = require("express");
const chatController = require("../../controllers/chat.controller");
const { checkUserPermission } = require("../../middlewares/permissions");
const auth = require("../../middlewares/auth");

const router = express.Router();

// Get all chat rooms / Create new chat room
router
  .route("/")
  .get(checkUserPermission(["chat_page"]), chatController.getChatRooms)
  .post(auth("manageUsers"), chatController.createChatRoom);

// Get unread message count for the current user
router.route("/unread-count").get(auth(), chatController.getUnreadMessageCount);

// Get chat room by order ID
router.route("/order/:orderId").get(auth(), chatController.getChatRoomByOrderId);

// Delete a specific message (legacy - hard delete)
router.route("/message/:id").delete(chatController.deleteChatMessage);

// Message management routes
router.route("/message/:messageId")
  .get(auth(), chatController.getMessageById);

// Edit message (Admin only)
router.route("/message/:messageId/edit")
  .patch(auth("manageUsers"), chatController.editMessage);

// Soft delete message (Admin only)
router.route("/message/:messageId/soft-delete")
  .patch(auth("manageUsers"), chatController.softDeleteMessage);

// Message reactions (any authenticated user)
router.route("/message/:messageId/reaction")
  .post(auth(), chatController.addReaction);

// Get chat room details by room ID
router.route("/room/:roomId").get(auth(), chatController.getChatRoomById);

// Participant management routes (Admin only)
router.route("/:roomId/participants")
  .get(auth(), chatController.getChatParticipants)
  .post(auth("manageUsers"), chatController.addParticipants);

router.route("/:roomId/participants/:userId")
  .delete(auth("manageUsers"), chatController.removeParticipant);

// Update chat room status (active, read_only, archived)
router.route("/:roomId/status")
  .patch(auth("manageUsers"), chatController.updateChatRoomStatus);

// Mark messages as read
router.route("/:roomId/mark-read")
  .patch(auth(), chatController.markMessagesAsRead);

// Get messages by room ID / Update / Delete chat room
router
  .route("/:id")
  .get(auth(), chatController.getChatsByRoomId)
  .patch(chatController.updateChatRoom)
  .delete(chatController.deleteChatRoom);

// Get files shared in a chat room
router.route("/files/:id").get(chatController.getChatFilesByRoomId);

module.exports = router;
