/**
 * Socket Emitters
 * Functions for emitting events to clients
 */

const logger = require("../../config/logger");

let ioInstance = null;

/**
 * Set the Socket.IO instance
 */
const setIO = (io) => {
  ioInstance = io;
};

/**
 * Get the Socket.IO instance
 */
const getIO = () => {
  return ioInstance;
};

/**
 * Emit notification to a specific user
 */
const emitNotificationToUser = (userId, notification) => {
  if (ioInstance && userId) {
    try {
      const userRoom = `user_${userId}`;
      logger.info(`emitNotificationToUser: Emitting to room ${userRoom}`);
      ioInstance.to(userRoom).emit("notification:new", notification);
      logger.info(`Notification emitted to user ${userId} in room ${userRoom}`);
    } catch (error) {
      logger.error(`Error emitting notification to user ${userId}: ${error.message}`);
    }
  } else {
    logger.warn(`emitNotificationToUser: Cannot emit - ioInstance: ${!!ioInstance}, userId: ${userId}`);
  }
};

/**
 * Emit notifications to multiple users
 */
const emitNotificationToUsers = (userIds, notification) => {
  if (ioInstance && userIds && userIds.length > 0) {
    try {
      userIds.forEach(userId => {
        if (userId) {
          const userRoom = `user_${userId}`;
          ioInstance.to(userRoom).emit("notification:new", notification);
        }
      });
      logger.info(`Notification emitted to ${userIds.length} users`);
    } catch (error) {
      logger.error(`Error emitting notifications to users: ${error.message}`);
    }
  }
};

/**
 * Emit participant added event to all users in a chat room
 */
const emitParticipantAdded = (roomId, data) => {
  if (ioInstance && roomId) {
    try {
      ioInstance.to(roomId).emit("participantAdded", data);
      logger.info(`Participant added event emitted to room ${roomId}`);
    } catch (error) {
      logger.error(`Error emitting participant added event: ${error.message}`);
    }
  }
};

/**
 * Emit participant removed event to all users in a chat room
 */
const emitParticipantRemoved = (roomId, data) => {
  if (ioInstance && roomId) {
    try {
      ioInstance.to(roomId).emit("participantRemoved", data);
      logger.info(`Participant removed event emitted to room ${roomId}`);
    } catch (error) {
      logger.error(`Error emitting participant removed event: ${error.message}`);
    }
  }
};

/**
 * Emit system message to a chat room
 */
const emitSystemMessage = (roomId, systemMessage) => {
  if (ioInstance && roomId) {
    try {
      ioInstance.to(roomId).emit("message", {
        roomId: roomId,
        messageId: systemMessage._id,
        message: systemMessage.message,
        message_type: 'system',
        system_message: systemMessage.system_message,
        createdAt: systemMessage.createdAt,
        success: true,
      });
      logger.info(`System message emitted to room ${roomId}`);
    } catch (error) {
      logger.error(`Error emitting system message: ${error.message}`);
    }
  }
};

/**
 * Emit chat room status change event
 */
const emitChatRoomStatusChange = (roomId, status) => {
  if (ioInstance && roomId) {
    try {
      ioInstance.to(roomId).emit("chatRoomStatusChanged", {
        roomId: roomId,
        status: status,
      });
      logger.info(`Chat room status change emitted to room ${roomId}: ${status}`);
    } catch (error) {
      logger.error(`Error emitting chat room status change: ${error.message}`);
    }
  }
};

/**
 * Emit socket error to a specific socket
 */
const emitSocketError = (socketId, message = "Unauthorized access! Please join the chat room again.") => {
  if (ioInstance) {
    logger.error(`SOCKET ERROR: ${message}`);
    ioInstance.to(socketId).emit("socketError", { message });
  }
};

module.exports = {
  setIO,
  getIO,
  emitNotificationToUser,
  emitNotificationToUsers,
  emitParticipantAdded,
  emitParticipantRemoved,
  emitSystemMessage,
  emitChatRoomStatusChange,
  emitSocketError,
};
