const httpStatus = require("http-status");
const pick = require("../utils/pick");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");
const { chatService } = require("../services");

const getChatRooms = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const filter = pick(requestQuery, ["client_id", "order_id"]);

  if (requestQuery.cp_id) {
    filter.cp_ids = {
      $elemMatch: { id: requestQuery.cp_id, decision: { $ne: "cancelled" } },
    };
  }
  if (requestQuery.manager_id) {
    filter.manager_ids = { $elemMatch: { id: requestQuery.manager_id } };
  }
  if (requestQuery.pm_id) {
    filter.pm_id = requestQuery.pm_id;
  }
  if (requestQuery.production_id) {
    filter.production_ids = { $elemMatch: { id: requestQuery.production_id } };
  }

  const options = pick(requestQuery, ["sortBy", "limit", "page", "populate"]);

  // Pass search as an option instead of a filter
  if (requestQuery.search) {
    options.search = requestQuery.search;
  }

  // Pass userId to include rooms where user was removed (persistent history)
  const userId = req.user ? (req.user.id || req.user._id) : null;

  const result = await chatService.getChatRooms(filter, options, userId);
  res.send(result);
});

const getChatRoomById = catchAsync(async (req, res) => {
  const chatRoom = await chatService.getChatRoomById(req.params.roomId);
  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found");
  }
  res.send(chatRoom);
});

/**
 * Get chats by room ID based on the provided options.
 * For removed participants, only returns messages up to when they were removed.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} A Promise that resolves with the chats.
 */
const getChatsByRoomId = catchAsync(async (req, res) => {
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  // Pass userId to filter messages for removed participants
  const userId = req.user ? (req.user.id || req.user._id) : null;
  const result = await chatService.getChatsByRoomId(options, req.params.id, userId);
  res.send(result);
});
const getChatFilesByRoomId = catchAsync(async (req, res) => {
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await chatService.getChatFilesByRoomId(options, req.params.id);
  res.send(result);
});

/**
 * Create a new chat room.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} A Promise that resolves with the created chat room.
 */
const createChatRoom = catchAsync(async (req, res) => {
  // Pass the admin user who is creating the chat
  const adminId = req.user.id || req.user._id;
  const chatRoom = await chatService.createChatRoom(req.body, adminId);
  res.status(httpStatus.CREATED).send(chatRoom);
});

/**
 * Delete a chat room by ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} A Promise that resolves with the deleted chat room.
 */
const deleteChatRoom = catchAsync(async (req, res) => {
  const deletedRoom = await chatService.deleteChatRoom(req.params.id);
  res.status(httpStatus.NO_CONTENT).send(deletedRoom);
});

/**
 * Update a chat room by ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} A Promise that resolves with the updated chat room.
 */
const updateChatRoom = catchAsync(async (req, res) => {
  const updatedRoom = await chatService.updateChatRoom(req.params.id, req.body);
  res.send(updatedRoom);
});

/**
 * Delete a chat message by ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} A Promise that resolves with the deleted chat message.
 */
const deleteChatMessage = catchAsync(async (req, res) => {
  const deletedMessage = await chatService.deleteChatMessage(req.params.id);
  res.status(httpStatus.NO_CONTENT).send(deletedMessage);
});

/**
 * Add participants to a chat room (Admin only)
 */
const addParticipants = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const { role, user_ids } = req.body;
  const adminId = req.user.id || req.user._id;
  const adminName = req.user.name || 'Admin';

  if (!role || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Role and user_ids are required");
  }

  const result = await chatService.addParticipants(roomId, { role, user_ids }, adminId, adminName);
  res.status(httpStatus.OK).send(result);
});

/**
 * Remove a participant from a chat room (Admin only)
 */
const removeParticipant = catchAsync(async (req, res) => {
  const { roomId, userId } = req.params;
  const { role } = req.body;
  const adminId = req.user.id || req.user._id;
  const adminName = req.user.name || 'Admin';

  if (!role) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Role is required");
  }

  const result = await chatService.removeParticipant(roomId, userId, role, adminId, adminName);
  res.status(httpStatus.OK).send(result);
});

/**
 * Get all participants of a chat room
 */
const getChatParticipants = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const participants = await chatService.getChatParticipants(roomId);
  res.status(httpStatus.OK).send(participants);
});

/**
 * Update chat room status (active, read_only, archived)
 */
const updateChatRoomStatus = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const { status } = req.body;
  const adminId = req.user.id || req.user._id;
  const adminName = req.user.name || 'Admin';

  if (!status || !['active', 'read_only', 'archived'].includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Valid status is required (active, read_only, archived)");
  }

  const chatRoom = await chatService.updateChatRoomStatus(roomId, status, adminId, adminName);
  res.status(httpStatus.OK).send(chatRoom);
});

/**
 * Mark messages as read for the current user
 */
const markMessagesAsRead = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id || req.user._id;

  const result = await chatService.markMessagesAsRead(roomId, userId);
  res.status(httpStatus.OK).send(result);
});

/**
 * Get unread message count for the current user
 */
const getUnreadMessageCount = catchAsync(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const count = await chatService.getUnreadMessageCount(userId);
  res.status(httpStatus.OK).send({ count });
});

/**
 * Get chat room by order ID
 */
const getChatRoomByOrderId = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const chatRoom = await chatService.getChatRoomByOrderId(orderId);
  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, "Chat room not found for this order");
  }
  res.status(httpStatus.OK).send(chatRoom);
});

/**
 * Edit a message (Admin only)
 */
const editMessage = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const { content } = req.body;
  const userId = req.user.id || req.user._id;

  if (!content || !content.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Message content is required");
  }

  const message = await chatService.editMessage(messageId, content.trim(), userId);
  res.status(httpStatus.OK).send(message);
});

/**
 * Soft delete a message (Admin only)
 */
const softDeleteMessage = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id || req.user._id;

  const message = await chatService.softDeleteMessage(messageId, userId);
  res.status(httpStatus.OK).send(message);
});

/**
 * Add or toggle a reaction on a message
 */
const addReaction = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req.user.id || req.user._id;
  const userName = req.user.name;

  if (!emoji) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Emoji is required");
  }

  const message = await chatService.addReaction(messageId, emoji, userId, userName);
  res.status(httpStatus.OK).send(message);
});

/**
 * Get a single message by ID
 */
const getMessageById = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const message = await chatService.getMessageById(messageId);
  res.status(httpStatus.OK).send(message);
});

module.exports = {
  getChatRooms,
  getChatsByRoomId,
  getChatRoomById,
  createChatRoom,
  updateChatRoom,
  deleteChatRoom,
  deleteChatMessage,
  getChatFilesByRoomId,
  // Participant management endpoints
  addParticipants,
  removeParticipant,
  getChatParticipants,
  updateChatRoomStatus,
  markMessagesAsRead,
  getUnreadMessageCount,
  getChatRoomByOrderId,
  // Message edit, delete, and reactions
  editMessage,
  softDeleteMessage,
  addReaction,
  getMessageById,
};
