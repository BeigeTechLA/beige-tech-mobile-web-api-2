const { Server } = require("socket.io");
// Import chatService directly to avoid circular dependency
const chatService = require("./chat.service");
const logger = require("../config/logger");
const { ChatRoom, User } = require("../models");
const { sendNotification } = require("./fcm.service");
const notificationService = require("./notification.service");

// Verify chatService is loaded correctly
if (!chatService || typeof chatService.isValidJoinRequest !== 'function') {
  logger.error("CRITICAL: chatService not loaded correctly!");
  logger.error("chatService:", chatService);
  logger.error("isValidJoinRequest:", chatService?.isValidJoinRequest);
} else {
  logger.info("chatService loaded successfully with all required functions");
}

// Store io instance globally for use in other services
let ioInstance = null;

function getIO() {
  return ioInstance;
}

// Function to emit notifications to specific users
function emitNotificationToUser(userId, notification) {
  if (ioInstance && userId) {
    try {
      const userRoom = `user_${userId}`;
      logger.info(`emitNotificationToUser: Emitting to room ${userRoom}, ioInstance exists: ${!!ioInstance}`);
      ioInstance.to(userRoom).emit("notification:new", notification);
      logger.info(`Notification emitted to user ${userId} in room ${userRoom}`);
    } catch (error) {
      logger.error(`Error emitting notification to user ${userId}: ${error.message}`);
    }
  } else {
    logger.warn(`emitNotificationToUser: Cannot emit - ioInstance: ${!!ioInstance}, userId: ${userId}`);
  }
}

// Function to emit notifications to multiple users
function emitNotificationToUsers(userIds, notification) {
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
}

function startSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  // Store io instance globally
  ioInstance = io;

  logger.info("Socket server started");

  //Define socket error emit function
  const emitSocketError = (
    socketId,
    message = "Unauthorized access! Please join the chat room again."
  ) => {
    logger.error(`SOCKET ERROR: ${message}`);
    io.to(socketId).emit("socketError", { message });
  };

  io.on("connection", (socket) => {
    let socketId = socket.id;
    let userName;
    let userId;
    let roomId;
    let roomData;
    let roomJoined = false;

    // Handle user joining their notification room
    socket.on("joinNotificationRoom", (data) => {
      try {
        const { userId: notifUserId, userRole } = data;
        if (notifUserId) {
          const userRoom = `user_${notifUserId}`;
          socket.join(userRoom);
          logger.info(`User ${notifUserId} (${userRole}) joined notification room: ${userRoom}`);
          socket.emit("notificationRoomJoined", {
            success: true,
            userId: notifUserId,
            room: userRoom,
          });
        }
      } catch (error) {
        logger.error(`Error joining notification room: ${error.message}`);
        socket.emit("socketError", { message: error.message });
      }
    });

    // Handle leaving notification room
    socket.on("leaveNotificationRoom", (data) => {
      try {
        const { userId: notifUserId } = data;
        if (notifUserId) {
          const userRoom = `user_${notifUserId}`;
          socket.leave(userRoom);
          logger.info(`User ${notifUserId} left notification room: ${userRoom}`);
        }
      } catch (error) {
        logger.error(`Error leaving notification room: ${error.message}`);
      }
    });

    // Start Handling Chat Room Join Event
    socket.on("joinRoom", async (data) => {
      try {
        logger.info(`joinRoom event received: ${JSON.stringify(data)}`);

        //Set the room variables
        userName = data.userName;
        userId = data.userId;
        roomId = data.roomId;

        // Check if user is logged in (has valid userId and userName)
        if (!userId || !userName) {
          logger.error("joinRoom: User not logged in - missing userId or userName");
          io.to(socketId).emit("roomJoined", { 
            success: false, 
            error: "You must be logged in to join a chat room. Please log in first." 
          });
          return;
        }

        // Validate required fields
        if (!roomId) {
          logger.error("joinRoom: Missing roomId");
          io.to(socketId).emit("roomJoined", { success: false, error: "Missing roomId" });
          return;
        }

        // Verify user exists in database
        const user = await User.findById(userId).select('_id isActive');
        if (!user) {
          logger.error(`joinRoom: User ${userId} not found in database`);
          io.to(socketId).emit("roomJoined", { 
            success: false, 
            error: "User not found. Please log in again." 
          });
          return;
        }

        // Check if user account is active
        if (user.isActive === false) {
          logger.error(`joinRoom: User ${userId} is deactivated`);
          io.to(socketId).emit("roomJoined", { 
            success: false, 
            error: "Your account has been deactivated. You cannot access chat rooms." 
          });
          return;
        }

        roomData = await ChatRoom.findById(roomId);
        logger.info(`Room data found: ${roomData ? 'yes' : 'no'}`);

        console.log('Room ID "' + typeof roomId + '" ' + roomId);
        console.log('User ID "' + typeof userId + '" ' + userId);
        console.log('User Name "' + typeof userName + '" ' + userName);

        //Validate chat room join request
        const isValid = await chatService.isValidJoinRequest(roomId);
        logger.info(`isValidJoinRequest result: ${isValid}`);

        if (!isValid) {
          io.to(socketId).emit("roomJoined", {
            success: false,
            error: "Invalid chat room"
          });
          logger.error(`Invalid chat room join request: ${socketId}, roomId: ${roomId}`);
        } else {
          //Join chat room
          socket.join(roomId);

          //Console chat room join info
          console.log(`${userName} [${socketId}] joined the chat`);

          //Join the user to the chatroom
          io.to(roomId).emit("roomJoined", {
            userName: userName,
            userId: userId,
            message: `${userName} joined the chat`,
            success: true,
          });

          //Set to true if room join is successful
          roomJoined = true;
        }
      } catch (error) {
        emitSocketError(socketId, error.message);
      }
    });
    // End Handling Chat Room Join Event

    // Handle Chat Room User Typing Event
    socket.on("userTyping", (data) => {
      try {
        if (!data || !data.roomId) {
          throw new Error("Invalid data received for userTyping event");
        }

        const { roomId: typingRoomId } = data;
        // Broadcast to all other users in the room (not the sender)
        socket.to(typingRoomId).emit("userTyping", {
          userName: userName,
          userId: userId,
          roomId: typingRoomId,
        });
      } catch (error) {
        emitSocketError(socketId, error.message);
      }
    });

    // Handle Chat Room User Stop Typing Event
    socket.on("stopTyping", (data) => {
      try {
        if (!data || !data.roomId) {
          throw new Error("Invalid data received for stopTyping event");
        }

        const { roomId: typingRoomId } = data;
        // Broadcast to all other users in the room (not the sender)
        socket.to(typingRoomId).emit("stopTyping", {
          userName: userName,
          userId: userId,
          roomId: typingRoomId,
        });
      } catch (error) {
        emitSocketError(socketId, error.message);
      }
    });

    // Handle Chat Room Message Event
    socket.on("message", async (data) => {
      try {
        logger.info(`Message event received from ${userName}[${socketId}]: ${JSON.stringify(data)}`);
        logger.info(`Room joined status: ${roomJoined}, roomId: ${roomId}, userId: ${userId}`);

        if (roomJoined) {
          // Check if user is logged in (has valid userId and userName)
          if (!userId || !userName) {
            logger.warn(`Unauthorized message attempt: userId=${userId}, userName=${userName}`);
            io.to(socketId).emit("message", {
              success: false,
              error: "You must be logged in to send messages. Please log in and try again."
            });
            return;
          }

          // Verify user exists in database (authentication check)
          const senderUser = await User.findById(userId).select('isActive');
          if (!senderUser) {
            logger.warn(`Invalid user ${userId} attempted to send message - user not found in database`);
            io.to(socketId).emit("message", {
              success: false,
              error: "User not found. Please log in again."
            });
            return;
          }

          // Check if user is active (per PRD: deactivated users cannot send messages)
          if (senderUser.isActive === false) {
            logger.warn(`Deactivated user ${userId} attempted to send message`);
            io.to(socketId).emit("message", {
              success: false,
              error: "Your account has been deactivated. You cannot send messages."
            });
            return;
          }

          // Check if chat room is active (not read_only or archived)
          if (roomData && roomData.status !== 'active') {
            logger.warn(`User ${userId} attempted to send message to ${roomData.status} chat`);
            io.to(socketId).emit("message", {
              success: false,
              error: `This conversation is ${roomData.status === 'read_only' ? 'read-only' : 'archived'}. You cannot send messages.`
            });
            return;
          }
          //Fetch message value and file data
          const { message, fileUrl, fileName, fileType, message_type, encryptedPayload, encryptedFileName } = data;

          // Determine message type
          const msgType = message_type || (fileUrl ? (fileType?.startsWith('image/') ? 'image' : 'file') : 'text');

          // Check if this is an E2E encrypted message
          const isEncrypted = !!(encryptedPayload && encryptedPayload.ciphertext && encryptedPayload.iv);

          // Process if message or file is provided
          const hasMessage = message !== null && typeof message !== "undefined" && message !== "";
          const hasFile = fileUrl && fileUrl !== "";
          const hasEncryptedContent = isEncrypted;

          if (hasMessage || hasFile || hasEncryptedContent) {
            // Prepare message data for storage
            const messageData = {
              chat_room_id: roomId,
              message: isEncrypted ? "[Encrypted]" : (message || ""),
              sent_by: userId,
              message_type: msgType,
              is_encrypted: isEncrypted,
            };

            // Add E2E encryption fields if present
            if (isEncrypted) {
              messageData.encrypted_content = {
                ciphertext: encryptedPayload.ciphertext,
                iv: encryptedPayload.iv,
                algorithm: encryptedPayload.algorithm || "AES-256-GCM",
                key_version: encryptedPayload.keyVersion || encryptedPayload.key_version || 1,
              };
            }

            // Add file fields if present
            if (hasFile) {
              messageData.file_url = fileUrl;
              messageData.file_name = isEncrypted && encryptedFileName ? "[Encrypted]" : (fileName || "");
              messageData.file_type = fileType || "";

              // Store encrypted file name if present
              if (encryptedFileName && encryptedFileName.ciphertext) {
                messageData.encrypted_file_name = {
                  ciphertext: encryptedFileName.ciphertext,
                  iv: encryptedFileName.iv,
                };
              }
            }

            //Store the received message in the database
            chatService
              .saveChatRoomMessage(messageData)
              .then(async (savedMessage) => {
                const messageId = savedMessage._id;

                //Print message details in the console
                console.log(
                  `${userName}[${socketId}] posted a message to room ${roomId}: ${message || '[File]'} | MESSAGE ID ${messageId}`
                );

                console.log(
                  `Message ID ${messageId} has been saved to the database`
                );

                // Log encryption details for debugging
                if (savedMessage.is_encrypted) {
                  console.log(`🔐 Encrypted message details:`, {
                    messageId: messageId,
                    is_encrypted: savedMessage.is_encrypted,
                    has_encrypted_content: !!savedMessage.encrypted_content,
                    encrypted_content_keys: savedMessage.encrypted_content ? Object.keys(savedMessage.encrypted_content) : [],
                    ciphertext_length: savedMessage.encrypted_content?.ciphertext?.length || 0,
                    iv_length: savedMessage.encrypted_content?.iv?.length || 0,
                    algorithm: savedMessage.encrypted_content?.algorithm || 'N/A',
                  });
                }

                //Emit the received message to the current room with roomId
                const emitData = {
                  roomId: roomId,
                  senderId: userId,
                  senderName: userName,
                  messageId: messageId,
                  message: savedMessage.is_encrypted ? "[Encrypted]" : (message || ""),
                  fileUrl: savedMessage.file_url,
                  fileName: savedMessage.is_encrypted ? "[Encrypted]" : savedMessage.file_name,
                  fileType: savedMessage.file_type,
                  message_type: savedMessage.message_type,
                  is_encrypted: savedMessage.is_encrypted,
                  success: true,
                };

                // Include encrypted payload for E2E decryption on client
                // Use the original encryptedPayload from request (not database) to ensure completeness
                if (isEncrypted && encryptedPayload) {
                  // Build the payload ensuring all fields are included
                  emitData.encryptedPayload = {
                    ciphertext: encryptedPayload.ciphertext || "",
                    iv: encryptedPayload.iv || "",
                    algorithm: encryptedPayload.algorithm || "AES-256-GCM",
                  };
                  
                  // Also include as encrypted_content for flexibility
                  emitData.encrypted_content = {
                    ciphertext: encryptedPayload.ciphertext || "",
                    iv: encryptedPayload.iv || "",
                    algorithm: encryptedPayload.algorithm || "AES-256-GCM",
                    key_version: encryptedPayload.keyVersion || encryptedPayload.key_version || 1,
                  };
                  
                  // Include keyVersion in camelCase if available
                  if (encryptedPayload.keyVersion || encryptedPayload.key_version) {
                    emitData.encryptedPayload.keyVersion = encryptedPayload.keyVersion || encryptedPayload.key_version;
                  }
                  
                  // Include encrypted file name if present
                  if (encryptedFileName && encryptedFileName.ciphertext) {
                    emitData.encryptedFileName = {
                      ciphertext: encryptedFileName.ciphertext,
                      iv: encryptedFileName.iv,
                    };
                    emitData.encrypted_file_name = {
                      ciphertext: encryptedFileName.ciphertext,
                      iv: encryptedFileName.iv,
                    };
                  }
                  
                  // Log what we're about to emit
                  console.log(`🔐 Socket.IO emit verification:`, {
                    messageId: messageId,
                    has_encryptedPayload: !!emitData.encryptedPayload,
                    encryptedPayload_ciphertext_len: emitData.encryptedPayload?.ciphertext?.length || 0,
                    encryptedPayload_iv_len: emitData.encryptedPayload?.iv?.length || 0,
                    has_encrypted_content: !!emitData.encrypted_content,
                    encrypted_content_ciphertext_len: emitData.encrypted_content?.ciphertext?.length || 0,
                  });
                }

                io.to(roomId).emit("message", emitData);
                io.emit("updateChatRoom", {
                  roomId: roomId,
                  message: message || fileName || "File shared",
                  success: true,
                });

                // Notify ALL participants (client, CPs, PMs, production, managers) except sender
                const messagePreview = message || (fileName ? `Shared: ${fileName}` : "File shared");
                logger.info(`[socket.message] About to call notifyAllParticipants for room ${roomId}, sender ${userId}`);
                notifyAllParticipants(roomId, userId, userName, messagePreview, messageId.toString())
                  .then(() => logger.info(`[socket.message] notifyAllParticipants completed for room ${roomId}`))
                  .catch((err) => logger.error(`[socket.message] notifyAllParticipants error: ${err.message}`));
              })
              .catch((error) => {
                logger.error(`Error saving message to database: ${error.message}`);
                logger.error(`Full error:`, error);
                io.to(socketId).emit("message", {
                  success: false,
                  error: `Failed to save message: ${error.message}`,
                });
              });
          }
        } else {
          logger.warn(`Message rejected - room not joined. roomJoined: ${roomJoined}, userId: ${userId}, roomId: ${roomId}`);
          // Emit to the socket directly, not to the room
          io.to(socketId).emit("message", {
            success: false,
            error: "You must join a room before sending messages"
          });
          logger.error(
            `User: ${userId} is not in the room, message not sent. ${socketId}`
          );
        }
      } catch (error) {
        emitSocketError(socketId, error.message);
      }
    });

    //Message status acknowledgment listener
    socket.on("receivedMessage", (data) => {
      try {
        if (roomJoined) {
          const { userId, messageId } = data;

          console.log("Message Status Acknowledgment Event Triggered");

          //Configure message status
          let messageStatus = "Seen";
          if (
            typeof data.messageStatus === "string" &&
            data.messageStatus.length > 0
          ) {
            messageStatus = data.messageStatus;
          }

          //Set message status update object
          const messageStatusObject = {
            senderId: userId,
            messageId: messageId,
            messageStatus: messageStatus,
          };

          //Store the received message in the database
          chatService.updateMessageStatus(messageStatusObject).then((r) => {
            console.log(
              `Message [${messageId}] status has been updated to "${messageStatus}"`
            );

            //Emit message status update to current room
            io.to(roomId).emit("updateMessageStatus", messageStatusObject);
          });
        } else {
          emitSocketError(socketId);
          console.log("Unauthorized user request");
        }
      } catch (error) {
        emitSocketError(socketId, error.message);
      }
    });

    // Handle message edit event
    socket.on("editMessage", async (data) => {
      try {
        const { messageId, content, roomId: msgRoomId, encryptedPayload } = data;
        const isEncrypted = !!(encryptedPayload && encryptedPayload.ciphertext && encryptedPayload.iv);

        if (!messageId || (!content && !isEncrypted)) {
          io.to(socketId).emit("messageEdited", { success: false, error: "Message ID and content required" });
          return;
        }

        // For encrypted messages, store encrypted content
        const contentToStore = isEncrypted ? "[Encrypted]" : content;
        const encryptedContent = isEncrypted ? {
          ciphertext: encryptedPayload.ciphertext,
          iv: encryptedPayload.iv,
          algorithm: encryptedPayload.algorithm || "AES-256-GCM",
          key_version: encryptedPayload.keyVersion || 1,
        } : null;

        const updatedMessage = await chatService.editMessage(messageId, contentToStore, userId, encryptedContent);

        // Broadcast to all users in the room
        const emitData = {
          success: true,
          messageId: messageId,
          content: isEncrypted ? "[Encrypted]" : content,
          editedAt: updatedMessage.edited_at,
          editedBy: userId,
          is_encrypted: isEncrypted,
        };

        if (isEncrypted) {
          emitData.encryptedPayload = encryptedContent;
        }

        io.to(msgRoomId || roomId).emit("messageEdited", emitData);
      } catch (error) {
        io.to(socketId).emit("messageEdited", { success: false, error: error.message });
      }
    });

    // Handle message delete event
    socket.on("deleteMessage", async (data) => {
      try {
        const { messageId, roomId: msgRoomId } = data;
        if (!messageId) {
          io.to(socketId).emit("messageDeleted", { success: false, error: "Message ID required" });
          return;
        }

        const updatedMessage = await chatService.softDeleteMessage(messageId, userId);
        // Broadcast to all users in the room
        io.to(msgRoomId || roomId).emit("messageDeleted", {
          success: true,
          messageId: messageId,
          deletedAt: updatedMessage.deleted_at,
          deletedBy: userId,
        });
      } catch (error) {
        io.to(socketId).emit("messageDeleted", { success: false, error: error.message });
      }
    });

    // Handle message reaction event
    socket.on("addReaction", async (data) => {
      try {
        logger.info(`addReaction event received: ${JSON.stringify(data)}, userId: ${userId}, userName: ${userName}`);
        const { messageId, emoji, roomId: msgRoomId } = data;
        if (!messageId || !emoji) {
          logger.error("addReaction: Missing messageId or emoji");
          io.to(socketId).emit("reactionUpdated", { success: false, error: "Message ID and emoji required" });
          return;
        }

        if (!userId) {
          logger.error("addReaction: User not authenticated (no userId)");
          io.to(socketId).emit("reactionUpdated", { success: false, error: "User not authenticated" });
          return;
        }

        // Get user name - fallback to fetching from DB if not set
        let reactUserName = userName;
        if (!reactUserName && userId) {
          const reactUser = await User.findById(userId).select('name');
          reactUserName = reactUser?.name || 'Unknown';
        }

        logger.info(`Adding reaction: messageId=${messageId}, emoji=${emoji}, userId=${userId}, userName=${reactUserName}`);
        const updatedMessage = await chatService.addReaction(messageId, emoji, userId, reactUserName || 'Unknown');
        logger.info(`Reaction added successfully, reactions count: ${updatedMessage.reactions?.length || 0}`);

        // Transform reactions to ensure user_id is a string for frontend
        const transformedReactions = updatedMessage.reactions?.map(r => ({
          emoji: r.emoji,
          user_id: r.user_id?.toString() || r.user_id,
          user_name: r.user_name,
          created_at: r.created_at
        })) || [];

        const targetRoom = msgRoomId || roomId;
        logger.info(`Broadcasting reactionUpdated to room: ${targetRoom}`);

        // Broadcast to all users in the room
        io.to(targetRoom).emit("reactionUpdated", {
          success: true,
          messageId: messageId,
          reactions: transformedReactions,
        });
      } catch (error) {
        logger.error(`Error adding reaction: ${error.message}`, error);
        io.to(socketId).emit("reactionUpdated", { success: false, error: error.message });
      }
    });

    // Handle reply message event
    socket.on("replyMessage", async (data) => {
      try {
        const { message, replyTo, fileUrl, fileName, fileType, roomId: msgRoomId, encryptedPayload, encryptedFileName } = data;
        const targetRoomId = msgRoomId || roomId;

        if (!replyTo) {
          io.to(socketId).emit("message", { success: false, error: "Reply target message ID required" });
          return;
        }

        // Check if this is an E2E encrypted message
        const isEncrypted = !!(encryptedPayload && encryptedPayload.ciphertext && encryptedPayload.iv);

        // Determine message type
        const msgType = fileUrl ? (fileType?.startsWith('image/') ? 'image' : 'file') : 'text';

        const messageData = {
          chat_room_id: targetRoomId,
          message: isEncrypted ? "[Encrypted]" : (message || ""),
          sent_by: userId,
          message_type: msgType,
          reply_to: replyTo,
          is_encrypted: isEncrypted,
        };

        // Add E2E encryption fields if present
        if (isEncrypted) {
          messageData.encrypted_content = {
            ciphertext: encryptedPayload.ciphertext,
            iv: encryptedPayload.iv,
            algorithm: encryptedPayload.algorithm || "AES-256-GCM",
            key_version: encryptedPayload.keyVersion || encryptedPayload.key_version || 1,
          };
        }

        if (fileUrl) {
          messageData.file_url = fileUrl;
          messageData.file_name = isEncrypted && encryptedFileName ? "[Encrypted]" : (fileName || "");
          messageData.file_type = fileType || "";

          if (encryptedFileName && encryptedFileName.ciphertext) {
            messageData.encrypted_file_name = {
              ciphertext: encryptedFileName.ciphertext,
              iv: encryptedFileName.iv,
            };
          }
        }

        const savedMessage = await chatService.sendReplyMessage(messageData);

        // Emit the reply message to the room
        const emitData = {
          roomId: targetRoomId,
          senderId: userId,
          senderName: userName,
          messageId: savedMessage._id,
          message: savedMessage.is_encrypted ? "[Encrypted]" : (message || ""),
          fileUrl: savedMessage.file_url,
          fileName: savedMessage.is_encrypted ? "[Encrypted]" : savedMessage.file_name,
          fileType: savedMessage.file_type,
          message_type: savedMessage.message_type,
          replyTo: savedMessage.reply_to,
          is_encrypted: savedMessage.is_encrypted,
          success: true,
        };

        // Log encryption details for debugging
        if (savedMessage.is_encrypted) {
          console.log(`🔐 Encrypted reply message details:`, {
            messageId: savedMessage._id,
            is_encrypted: savedMessage.is_encrypted,
            has_encrypted_content: !!savedMessage.encrypted_content,
            encrypted_content_keys: savedMessage.encrypted_content ? Object.keys(savedMessage.encrypted_content) : [],
            ciphertext_length: savedMessage.encrypted_content?.ciphertext?.length || 0,
            iv_length: savedMessage.encrypted_content?.iv?.length || 0,
            algorithm: savedMessage.encrypted_content?.algorithm || 'N/A',
          });
        }

        // Include encrypted payload for E2E decryption on client
        // Use the original encryptedPayload from request (not database) to ensure completeness
        if (isEncrypted && encryptedPayload) {
          // Build the payload ensuring all fields are included
          emitData.encryptedPayload = {
            ciphertext: encryptedPayload.ciphertext || "",
            iv: encryptedPayload.iv || "",
            algorithm: encryptedPayload.algorithm || "AES-256-GCM",
          };
          
          // Also include as encrypted_content for flexibility
          emitData.encrypted_content = {
            ciphertext: encryptedPayload.ciphertext || "",
            iv: encryptedPayload.iv || "",
            algorithm: encryptedPayload.algorithm || "AES-256-GCM",
            key_version: encryptedPayload.keyVersion || encryptedPayload.key_version || 1,
          };
          
          // Include keyVersion in camelCase if available
          if (encryptedPayload.keyVersion || encryptedPayload.key_version) {
            emitData.encryptedPayload.keyVersion = encryptedPayload.keyVersion || encryptedPayload.key_version;
          }
          
          // Include encrypted file name if present
          if (encryptedFileName && encryptedFileName.ciphertext) {
            emitData.encryptedFileName = {
              ciphertext: encryptedFileName.ciphertext,
              iv: encryptedFileName.iv,
            };
            emitData.encrypted_file_name = {
              ciphertext: encryptedFileName.ciphertext,
              iv: encryptedFileName.iv,
            };
          }
          
          // Log what we're about to emit
          console.log(`🔐 Reply Socket.IO emit verification:`, {
            messageId: savedMessage._id,
            has_encryptedPayload: !!emitData.encryptedPayload,
            encryptedPayload_ciphertext_len: emitData.encryptedPayload?.ciphertext?.length || 0,
            encryptedPayload_iv_len: emitData.encryptedPayload?.iv?.length || 0,
            has_encrypted_content: !!emitData.encrypted_content,
            encrypted_content_ciphertext_len: emitData.encrypted_content?.ciphertext?.length || 0,
          });
        }

        io.to(targetRoomId).emit("message", emitData);

        // Update chat room
        io.emit("updateChatRoom", {
          roomId: targetRoomId,
          message: isEncrypted ? "[Encrypted message]" : (message || fileName || "Replied to a message"),
          success: true,
        });

        // Notify ALL participants (client, CPs, PMs, production, managers) except sender
        const messagePreview = isEncrypted ? "[Encrypted message]" : (message || (fileName ? `Shared: ${fileName}` : "Replied to a message"));
        notifyAllParticipants(targetRoomId, userId, userName, messagePreview, savedMessage._id.toString());
      } catch (error) {
        io.to(socketId).emit("message", { success: false, error: error.message });
      }
    });

    // Handle order request from client
    socket.on("sendOrderRequest", (data) => {
      const { orderData, cpSocketId } = data;
      if (orderData && orderData.cp_ids && Array.isArray(orderData.cp_ids)) {
        orderData.cp_ids.forEach((cp) => {
          const cpSocketId = cp.id; // Assuming cp.id contains the socket ID of the content producer
          // Define the room name based on content producer's socket ID
          const roomName = `cpRoom_${cpSocketId}`;
          // Join the room
          socket.join(roomName);
          // Emit the order request response to the room
          io.to(roomName).emit("orderRequestResponse", orderData);
        });
      } else {
        console.error("🚀 Invalid or missing data received for order request");
      }
    });
    // Handle joining a room associated with the content producer's socket ID
    socket.on("joinCPRoom", (cpSocketId) => {
      const roomName = `cpRoom_${cpSocketId}`;
      socket.join(roomName);
      console.log(`Socket ${socket.id} joined room ${roomName}`);
    });
    // Handle 'acceptOrder' event from content producer
    socket.on("acceptOrder", (Cp) => {
      // Emit an event to the client app to notify that the order has been accepted
      io.emit("orderAccepted", Cp);
    });

    socket.on("disconnect", () => {
      try {
        socket.leave(roomId);
        io.to(roomId).emit("leftChat", {
          userId: userId,
          userName: userName,
          message: `${userName} left the chat`,
        });
        console.log(`${socket.id} disconnected`);
      } catch (error) {
        emitSocketError(socketId, error.message);
      }
    });
  });
}

/**
 * Emit participant added event to all users in a chat room
 * @param {string} roomId - Chat room ID
 * @param {Object} data - Event data including added participants
 */
function emitParticipantAdded(roomId, data) {
  if (ioInstance && roomId) {
    try {
      ioInstance.to(roomId).emit("participantAdded", data);
      logger.info(`Participant added event emitted to room ${roomId}`);
    } catch (error) {
      logger.error(`Error emitting participant added event: ${error.message}`);
    }
  }
}

/**
 * Emit participant removed event to all users in a chat room
 * @param {string} roomId - Chat room ID
 * @param {Object} data - Event data including removed participant
 */
function emitParticipantRemoved(roomId, data) {
  if (ioInstance && roomId) {
    try {
      ioInstance.to(roomId).emit("participantRemoved", data);
      logger.info(`Participant removed event emitted to room ${roomId}`);
    } catch (error) {
      logger.error(`Error emitting participant removed event: ${error.message}`);
    }
  }
}

/**
 * Emit system message to a chat room
 * @param {string} roomId - Chat room ID
 * @param {Object} systemMessage - System message data
 */
function emitSystemMessage(roomId, systemMessage) {
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
}

/**
 * Emit chat room status change event
 * @param {string} roomId - Chat room ID
 * @param {string} status - New status (active, read_only, archived)
 */
function emitChatRoomStatusChange(roomId, status) {
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
}

/**
 * Notify all participants in a chat room about a new message
 * Excludes the sender from notifications
 * @param {string} roomId - Chat room ID
 * @param {string} senderId - Sender user ID (to exclude from notifications)
 * @param {string} senderName - Sender name
 * @param {string} messagePreview - Message preview text
 * @param {string} messageId - Message ID
 */
async function notifyAllParticipants(roomId, senderId, senderName, messagePreview, messageId) {
  try {
    const chatRoom = await ChatRoom.findById(roomId);
    if (!chatRoom) {
      logger.warn(`notifyAllParticipants: ChatRoom not found for roomId: ${roomId}`);
      return;
    }

    logger.info(`notifyAllParticipants: Processing room ${roomId}, sender: ${senderId}`);
    logger.info(`ChatRoom participants: client_id=${chatRoom.client_id}, pm_id=${chatRoom.pm_id}, cp_ids=${JSON.stringify(chatRoom.cp_ids)}, manager_ids=${JSON.stringify(chatRoom.manager_ids)}, production_ids=${JSON.stringify(chatRoom.production_ids)}`);

    const participantIds = [];

    // Collect all participant IDs
    if (chatRoom.client_id && chatRoom.client_id.toString() !== senderId) {
      participantIds.push(chatRoom.client_id.toString());
    }
    if (chatRoom.pm_id && chatRoom.pm_id.toString() !== senderId) {
      participantIds.push(chatRoom.pm_id.toString());
    }
    if (chatRoom.cp_ids) {
      chatRoom.cp_ids.forEach(cp => {
        const cpId = cp.id.toString();
        if (cpId !== senderId) {
          participantIds.push(cpId);
        }
      });
    }
    if (chatRoom.production_ids) {
      chatRoom.production_ids.forEach(p => {
        const pId = p.id.toString();
        if (pId !== senderId) {
          participantIds.push(pId);
        }
      });
    }
    if (chatRoom.manager_ids) {
      chatRoom.manager_ids.forEach(m => {
        const mId = m.id.toString();
        if (mId !== senderId) {
          participantIds.push(mId);
        }
      });
    }

    // Remove duplicates
    const uniqueParticipantIds = [...new Set(participantIds)];

    logger.info(`notifyAllParticipants: Collected ${participantIds.length} participants (${uniqueParticipantIds.length} unique): ${JSON.stringify(uniqueParticipantIds)}`);

    // Update unread counts for all participants
    for (const participantId of uniqueParticipantIds) {
      const currentCount = chatRoom.unread_counts?.get(participantId) || 0;
      chatRoom.unread_counts = chatRoom.unread_counts || new Map();
      chatRoom.unread_counts.set(participantId, currentCount + 1);
    }
    await chatRoom.save();

    // Send push notifications and socket notifications to all participants
    const notificationTitle = "New message";
    const notificationContent = `${senderName}: ${messagePreview.substring(0, 50)}${messagePreview.length > 50 ? '...' : ''}`;

    // Separate participants by role for database notification
    const clientId = chatRoom.client_id && chatRoom.client_id.toString() !== senderId ? chatRoom.client_id.toString() : null;
    const cpIds = chatRoom.cp_ids
      ? chatRoom.cp_ids.filter(cp => cp.id.toString() !== senderId).map(cp => cp.id.toString())
      : [];
    const managerIds = chatRoom.manager_ids
      ? chatRoom.manager_ids.filter(m => m.id.toString() !== senderId).map(m => m.id.toString())
      : [];

    // Save notification to database for the notification panel
    logger.info(`[notifyAllParticipants] Attempting to save notification to database...`);
    logger.info(`[notifyAllParticipants] messageId: ${messageId}, clientId: ${clientId}, cpIds: ${JSON.stringify(cpIds)}, managerIds: ${JSON.stringify(managerIds)}`);

    try {
      const notificationData = {
        modelName: "ChatMessage",
        modelId: messageId,
        message: notificationContent,
        category: "newMessage",
        clientId: clientId,
        cpIds: cpIds,
        managerIds: managerIds,
        metadata: {
          type: "newMessage",
          title: notificationTitle,
          senderId: senderId,
          senderName: senderName,
          roomId: roomId,
          messageId: messageId,
        },
      };

      logger.info(`[notifyAllParticipants] Notification data: ${JSON.stringify(notificationData)}`);

      const savedNotification = await notificationService.insertNotification(notificationData);
      logger.info(`[notifyAllParticipants] Notification saved successfully with ID: ${savedNotification?._id}`);
    } catch (dbError) {
      logger.error(`[notifyAllParticipants] Error saving notification to database: ${dbError.message}`);
      logger.error(`[notifyAllParticipants] Full error: ${JSON.stringify(dbError, Object.getOwnPropertyNames(dbError))}`);
    }

    for (const participantId of uniqueParticipantIds) {
      // Send FCM push notification (for mobile/browser push)
      sendNotification(
        participantId,
        notificationTitle,
        notificationContent,
        {
          type: "newMessage",
          senderId: senderId,
          receiverId: participantId,
          roomId: roomId,
          id: roomId,
          messageId: messageId,
        }
      );

      // Send socket notification for real-time updates
      logger.info(`Sending socket notification to user ${participantId} for room ${roomId}`);
      emitNotificationToUser(participantId, {
        type: "newMessage",
        title: notificationTitle,
        message: notificationContent,
        senderId: senderId,
        senderName: senderName,
        roomId: roomId,
        messageId: messageId,
        createdAt: new Date().toISOString(),
      });
    }

    logger.info(`Notifications (FCM + Socket + DB) sent to ${uniqueParticipantIds.length} participants in room ${roomId}`);
  } catch (error) {
    logger.error(`Error notifying participants: ${error.message}`);
  }
}

/**
 * Notify added participants about being added to a chat
 * @param {Array} userIds - Array of user IDs that were added
 * @param {string} roomId - Chat room ID
 * @param {string} orderName - Order/shoot name for context
 */
async function notifyAddedParticipants(userIds, roomId, orderName) {
  try {
    const notificationTitle = "Added to conversation";
    const notificationContent = `You have been added to the conversation for ${orderName}`;

    for (const userId of userIds) {
      // Send push notification
      sendNotification(
        userId.toString(),
        notificationTitle,
        notificationContent,
        {
          type: "addedToChat",
          roomId: roomId,
          id: roomId,
        }
      );

      // Emit socket notification
      emitNotificationToUser(userId.toString(), {
        type: "addedToChat",
        message: notificationContent,
        roomId: roomId,
      });
    }

    logger.info(`Added-to-chat notifications sent to ${userIds.length} users`);
  } catch (error) {
    logger.error(`Error notifying added participants: ${error.message}`);
  }
}

/**
 * Notify removed participant about being removed from a chat
 * @param {string} userId - User ID that was removed
 * @param {string} roomId - Chat room ID
 * @param {string} orderName - Order/shoot name for context
 * @param {string} removedBy - Name of admin who removed them
 */
async function notifyRemovedParticipant(userId, roomId, orderName, removedBy) {
  try {
    const notificationTitle = "Removed from conversation";
    const notificationContent = `You have been removed from the conversation for ${orderName} by ${removedBy}`;

    // Send push notification
    sendNotification(
      userId.toString(),
      notificationTitle,
      notificationContent,
      {
        type: "removedFromChat",
        roomId: roomId,
        id: roomId,
      }
    );

    // Emit socket notification
    emitNotificationToUser(userId.toString(), {
      type: "removedFromChat",
      message: notificationContent,
      roomId: roomId,
    });

    logger.info(`Removed-from-chat notification sent to user ${userId}`);
  } catch (error) {
    logger.error(`Error notifying removed participant: ${error.message}`);
  }
}

/**
 * Emit encryption key request to participants in a chat room
 * Used when new participants are added and need encryption keys
 * @param {string} roomId - Chat room ID
 * @param {string[]} newUserIds - Array of new user IDs who need keys
 */
function emitEncryptionKeyRequest(roomId, newUserIds) {
  if (ioInstance && roomId) {
    try {
      ioInstance.to(roomId).emit("encryptionKeyRequest", {
        roomId: roomId,
        newUserIds: newUserIds,
      });
      logger.info(`Encryption key request emitted to room ${roomId} for users: ${newUserIds.join(', ')}`);
    } catch (error) {
      logger.error(`Error emitting encryption key request: ${error.message}`);
    }
  }
}

module.exports = {
  startSocketServer,
  getIO,
  emitNotificationToUser,
  emitNotificationToUsers,
  // New exports for participant management
  emitParticipantAdded,
  emitParticipantRemoved,
  emitSystemMessage,
  emitChatRoomStatusChange,
  notifyAllParticipants,
  notifyAddedParticipants,
  notifyRemovedParticipant,
  // Encryption key management
  emitEncryptionKeyRequest,
};
