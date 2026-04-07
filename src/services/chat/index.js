/**
 * Chat Service Index
 * Re-exports all chat-related services for backward compatibility
 */

const chatRoomService = require('./chatRoom.service');
const chatMessageService = require('./chatMessage.service');
const chatParticipantService = require('./chatParticipant.service');

module.exports = {
  // Chat Room operations
  getChatRooms: chatRoomService.getChatRooms,
  getChatRoomById: chatRoomService.getChatRoomById,
  getChatRoomByOrderId: chatRoomService.getChatRoomByOrderId,
  getChatRoomByUserId: chatRoomService.getChatRoomByUserId,
  createChatRoom: chatRoomService.createChatRoom,
  updateChatRoom: chatRoomService.updateChatRoom,
  updateChatRoomWithCpIds: chatRoomService.updateChatRoomWithCpIds,
  deleteChatRoom: chatRoomService.deleteChatRoom,
  isValidJoinRequest: chatRoomService.isValidJoinRequest,
  updateChatRoomStatus: chatRoomService.updateChatRoomStatus,
  updateChatStatusByOrderStatus: chatRoomService.updateChatStatusByOrderStatus,

  // Chat Message operations
  getChatsByRoomId: chatMessageService.getChatsByRoomId,
  getChatFilesByRoomId: chatMessageService.getChatFilesByRoomId,
  saveChatRoomMessage: chatMessageService.saveChatRoomMessage,
  updateMessageStatus: chatMessageService.updateMessageStatus,
  deleteChatMessage: chatMessageService.deleteChatMessage,
  editMessage: chatMessageService.editMessage,
  softDeleteMessage: chatMessageService.softDeleteMessage,
  addReaction: chatMessageService.addReaction,
  sendReplyMessage: chatMessageService.sendReplyMessage,
  getMessageById: chatMessageService.getMessageById,

  // Chat Participant operations
  addParticipants: chatParticipantService.addParticipants,
  removeParticipant: chatParticipantService.removeParticipant,
  getChatParticipants: chatParticipantService.getChatParticipants,
  isParticipant: chatParticipantService.isParticipant,
  markMessagesAsRead: chatParticipantService.markMessagesAsRead,
  getUnreadMessageCount: chatParticipantService.getUnreadMessageCount,
};
