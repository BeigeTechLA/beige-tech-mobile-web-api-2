const httpStatus = require("http-status");
const { Notification, User } = require("../models");
const ApiError = require("../utils/ApiError");
const { roles } = require("../config/roles");
const { sendNotification } = require("./fcm.service");
const { emitNotificationToUser, emitNotificationToUsers } = require("./socket.service");

/**
 * Single reusable method to insert a notification
 * @param {Object} data - Notification data
 * @param {String} data.modelName - The name of the model related to the notification
 * @param {String} data.modelId - The ID of the related model record
 * @param {String} data.clientId - The client ID (optional)
 * @param {Array} data.cpIds - Array of CP IDs (optional)
 * @param {String} data.category - Category of notification (defaults to modelName if not provided)
 * @param {String} data.message - Notification message
 * @param {Object} data.metadata - Additional metadata (optional)
 * @param {Boolean} data.sendPushNotification - Whether to send push notification (default: false)
 * @returns {Promise<Notification>}
 */
const insertNotification = async (data) => {
  console.log('[Notification Service] insertNotification called with:', JSON.stringify(data));

  // Validate required fields
  if (!data.modelName) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Model name is required");
  }

  if (!data.modelId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Model ID is required");
  }

  if (!data.message) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Message is required");
  }

  // Set category to modelName if not provided
  if (!data.category) {
    data.category = data.modelName;
  }

  // Create notification object
  const notificationData = {
    modelName: data.modelName,
    modelId: data.modelId,
    message: data.message,
    category: data.category,
    isRead: false,
    metadata: data.metadata || {},
  };

  // Add role-specific fields if provided
  if (data.clientId) {
    notificationData.clientId = data.clientId;
  }

  if (data.cpIds && data.cpIds.length > 0) {
    notificationData.cpIds = data.cpIds;
  }

  if (data.managerIds && data.managerIds.length > 0) {
    notificationData.managerIds = data.managerIds;
  }

  console.log('[Notification Service] Creating notification with data:', JSON.stringify(notificationData));

  // Create the notification in the database
  const notification = await Notification.create(notificationData);

  console.log('[Notification Service] ===== NOTIFICATION CREATED =====');
  console.log('[Notification Service] Notification ID:', notification._id.toString());
  console.log('[Notification Service] Category:', notification.category);
  console.log('[Notification Service] ClientId:', notification.clientId);
  console.log('[Notification Service] CpIds:', notification.cpIds);
  console.log('[Notification Service] ManagerIds:', notification.managerIds);
  console.log('[Notification Service] ================================');

  // Emit real-time socket notification
  const socketNotification = {
    id: notification._id.toString(),
    modelName: notification.modelName,
    modelId: notification.modelId.toString(),
    category: notification.category,
    message: notification.message,
    isRead: notification.isRead,
    metadata: notification.metadata,
    createdAt: notification.createdAt,
  };

  // Emit to client if clientId is present
  if (data.clientId) {
    emitNotificationToUser(data.clientId.toString(), socketNotification);
  }

  // Emit to all CPs if cpIds are present
  if (data.cpIds && data.cpIds.length > 0) {
    const cpIdStrings = data.cpIds.map(id => id.toString());
    emitNotificationToUsers(cpIdStrings, socketNotification);
  }

  // Emit to all managers if managerIds are present
  if (data.managerIds && data.managerIds.length > 0) {
    const managerIdStrings = data.managerIds.map(id => id.toString());
    emitNotificationToUsers(managerIdStrings, socketNotification);
  }

  return notification;
};

/**
 * Legacy method for backward compatibility
 * @param {Object} notificationBody - The notification data
 * @returns {Promise<Notification>}
 * @deprecated Use insertNotification instead
 */
const createNotification = async (notificationBody) => {
  console.warn('createNotification is deprecated. Use insertNotification instead.');
  
  // Convert old format to new format
  const newFormatData = {
    modelName: notificationBody.category?.name || 'Notification',
    modelId: notificationBody.category?.id || new mongoose.Types.ObjectId(),
    message: notificationBody.message?.body || 'Notification',
    category: notificationBody.category?.name || 'Notification',
    metadata: {},
  };
  
  // Add role-specific fields
  if (notificationBody.clientId) {
    newFormatData.clientId = notificationBody.clientId;
  }
  
  if (notificationBody.cpIds && notificationBody.cpIds.length > 0) {
    newFormatData.cpIds = notificationBody.cpIds;
  }
  
  // Store additional data in metadata
  newFormatData.metadata = {
    legacyFormat: true,
    role: notificationBody.role,
    title: notificationBody.message?.title,
    userId: notificationBody.userId,
    adminId: notificationBody.adminId,
  };
  
  return insertNotification(newFormatData);
};

/**
 * Create a notification from push notification data
 * This method is designed to be called after sending push notifications
 * @param {string} userId - The user ID
 * @param {string} title - The notification title
 * @param {string} content - The notification content
 * @param {Object} customData - Additional data for the notification
 * @returns {Promise<Object>} The created notification
 */
const createNotificationData = async (userId, title, content, customData) => {
  // Create notification using the new schema
  const notificationData = {
    modelName: customData?.type || 'Notification',
    modelId: customData?.id || userId,
    message: content,
    category: customData?.type || 'Notification',
    clientId: userId, // Assuming userId is the client ID
    cpIds: customData?.cpIds || [], // If CP IDs are provided in customData
    metadata: {
      title: title,
      ...customData
    },
    // Don't send push notification again to avoid infinite loop
    sendPushNotification: false
  };

  // Use the insertNotification method to create the notification
  return insertNotification(notificationData);
};

/**
 * Query for notifications with pagination
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryNotifications = async (filter, options) => {
  console.log('[Notification Service] queryNotifications called with filter:', JSON.stringify(filter));
  console.log('[Notification Service] queryNotifications options:', JSON.stringify(options));

  const notifications = await Notification.paginate(filter, options);

  console.log('[Notification Service] Query returned', notifications.totalResults, 'total results,', notifications.results?.length, 'in current page');

  // Enrich notifications with orderId if not already present
  if (notifications.results && notifications.results.length > 0) {
    const { Meeting } = require('../models');
    const { Order } = require('../models');

    for (let notification of notifications.results) {
      if (!notification.metadata) {
        notification.metadata = {};
      }

      // Check if this is a Meeting notification and doesn't already have orderId in metadata
      if (notification.modelName === 'Meeting' && !notification.metadata.orderId) {
        try {
          // Find the order that contains this meeting
          const order = await Order.findOne({
            meeting_date_times: notification.modelId
          }).select('_id');

          if (order) {
            // Add orderId to metadata
            notification.metadata.orderId = order._id.toString();
          }
        } catch (error) {
          // Continue if there's an error fetching the order
          console.error('Error enriching meeting notification with orderId:', error);
        }
      }

      // Check if this is an Order notification and doesn't already have orderId in metadata
      if (notification.modelName === 'Order' && !notification.metadata.orderId) {
        try {
          // For Order notifications, the modelId is the order ID
          notification.metadata.orderId = notification.modelId.toString();
        } catch (error) {
          console.error('Error enriching order notification with orderId:', error);
        }
      }
    }
  }

  return notifications;
};

/**
 * Get notification by id
 * @param {ObjectId} id
 * @returns {Promise<Notification>}
 */
const getNotificationById = async (id) => {
  return Notification.findById(id);
};

/**
 * Get notifications for a specific user based on their role
 * @param {ObjectId} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Notification[]>}
 */
const getNotificationsForUser = async (reqData) => {
  let query = {};
  // Role-based filtering
  if (reqData.adminId) {
    // Admins can see all notifications
    // No additional filters needed
  } else if (reqData.managerId) {
    // Managers can see notifications where they are in the managerIds array
    query.managerIds = reqData.managerId;
  } else if (reqData.clientId) {
    // Clients can see only their notifications
    query.clientId = reqData.clientId;
  } else if (reqData.cpId) {
    // CPs can see notifications where they are in the cpIds array
    query.cpIds = reqData.cpId;
  } else {
    // If role is not recognized, return empty array
    return [];
  }

  return Notification.find(query).sort({ createdAt: -1 });
};

/**
 * Get notifications by category for a specific user
 * @param {String} category - Category name
 * @param {ObjectId} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Notification[]>}
 */
const getNotificationsByCategory = async (category, userId, userRole) => {
  let query = { category };
  
  // Role-based filtering
  if (userRole === roles.ADMIN) {
    // Admins can see all notifications in this category
    // No additional filters needed
  } else if (userRole === roles.CLIENT) {
    // Clients can see only their notifications in this category
    query.clientId = userId;
  } else if (userRole === roles.CONTENT_PROVIDER) {
    // CPs can see notifications where they are in the cpIds array in this category
    query.cpIds = userId;
  } else {
    // If role is not recognized, return empty array
    return [];
  }
  
  return Notification.find(query).sort({ createdAt: -1 });
};

/**
 * Get notifications by model name and ID
 * @param {String} modelName - Model name
 * @param {ObjectId} modelId - Model ID
 * @param {ObjectId} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Notification[]>}
 */
const getNotificationsByModel = async (modelName, modelId, userId, userRole) => {
  let query = { modelName, modelId };
  
  // Role-based filtering
  if (userRole === roles.ADMIN) {
    // Admins can see all notifications for this model
    // No additional filters needed
  } else if (userRole === roles.CLIENT) {
    // Clients can see only their notifications for this model
    query.clientId = userId;
  } else if (userRole === roles.CONTENT_PROVIDER) {
    // CPs can see notifications where they are in the cpIds array for this model
    query.cpIds = userId;
  } else {
    // If role is not recognized, return empty array
    return [];
  }
  
  return Notification.find(query).sort({ createdAt: -1 });
};

/**
 * Update notification by id
 * @param {ObjectId} notificationId
 * @param {Object} updateBody
 * @returns {Promise<Notification>}
 */
const updateNotificationById = async (notificationId, updateBody) => {
  const notification = await getNotificationById(notificationId);
  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, "Notification not found");
  }
  Object.assign(notification, updateBody);
  await notification.save();
  return notification;
};

/**
 * Delete notification by id
 * @param {ObjectId} notificationId
 * @returns {Promise<Notification>}
 */
const deleteNotificationById = async (notificationId) => {
  const notification = await getNotificationById(notificationId);
  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, "Notification not found");
  }
  await notification.deleteOne();
  return notification;
};

/**
 * Mark notification as read
 * @param {ObjectId} notificationId
 * @returns {Promise<Notification>}
 */
const markAsRead = async (notificationId) => {
  return updateNotificationById(notificationId, { 
    isRead: true,
    readAt: new Date()
  });
};

/**
 * Mark all notifications as read for a user based on their role
 * @param {ObjectId} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Object>} - Result with count of updated notifications
 */
const markAllAsRead = async (userId, userRole) => {
  let query = { isRead: false };
  
  // Role-based filtering
  if (userRole === 'admin') {
    // Admins can mark all notifications as read
    // No additional filters needed
  } else if (userRole === 'user') {
    // Clients can only mark their notifications as read
    query.clientId = userId;
  } else if (userRole === 'cp') {
    // CPs can only mark their notifications as read
    query.cpIds = userId;
  } else {
    // If role is not recognized, return 0 count
    return { count: 0 };
  }
  
  const result = await Notification.updateMany(
    query,
    { $set: { isRead: true, readAt: new Date() } }
  );
  
  return { count: result.modifiedCount };
};

/**
 * Get unread notification count for a user based on their role
 * @param {ObjectId} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Number>} - Count of unread notifications
 */
const getUnreadCount = async (reqData) => {
  let query = { isRead: false };

  // Role-based filtering
  if (reqData.adminId) {
    // Admins can see count of all unread notifications
    // No additional filters needed
  } else if (reqData.managerId) {
    // Managers can only see count of their unread notifications
    query.managerIds = reqData.managerId;
  } else if (reqData.clientId) {
    // Clients can only see count of their unread notifications
    query.clientId = reqData.clientId;
  } else if (reqData.cpId) {
    // CPs can only see count of their unread notifications
    query.cpIds = reqData.cpId;
  } else {
    // If role is not recognized, return 0 count
    return 0;
  }

  return Notification.countDocuments(query);
};

/**
 * Delete all notifications for a specific model and ID
 * @param {String} modelName - Model name
 * @param {ObjectId} modelId - Model ID
 * @returns {Promise<Object>} - Result with count of deleted notifications
 */
const deleteNotificationsByModel = async (modelName, modelId) => {
  const result = await Notification.deleteMany({ modelName, modelId });
  return { count: result.deletedCount };
};

/**
 * Delete all notifications for a specific user
 * @param {ObjectId} userId - User ID
 * @param {String} userRole - User role
 * @returns {Promise<Object>} - Result with count of deleted notifications
 */
const deleteAllUserNotifications = async (userId, userRole) => {
  let query = {};
  
  if (userRole === roles.CLIENT) {
    query.clientId = userId;
  } else if (userRole === roles.CONTENT_PROVIDER) {
    query.cpIds = userId;
  } else {
    // If role is not recognized or admin, return 0 count
    // We don't allow admins to delete all notifications
    return { count: 0 };
  }
  
  const result = await Notification.deleteMany(query);
  return { count: result.deletedCount };
};
// utils
const filteredCategoryName = (categoryName) => {
  switch (categoryName) {
    case "newMessage":
      return "chats";
    case "disputeStatusUpdate":
      return "disputes";
    case "newDispute":
      return "disputes";
    case "newMeeting":
      return "meetings";
    case "meetingScheduleUpdateRequest":
      return "meetings";
    case "meetingStatusUpdate":
      return "meetings";
    case "newOder":
      return "shoots";
    case "orderStatusUpdate":
      return "shoots";
    default:
      return "";
  }
};
module.exports = {
  // New primary method for creating notifications
  insertNotification,
  
  // Legacy methods for backward compatibility
  createNotification,
  createNotificationData,
  
  // Query methods
  queryNotifications,
  getNotificationById,
  getNotificationsForUser,
  getNotificationsByCategory,
  getNotificationsByModel,
  getUnreadCount,
  
  // Update methods
  updateNotificationById,
  markAsRead,
  markAllAsRead,
  
  // Delete methods
  deleteNotificationById,
  deleteNotificationsByModel,
  deleteAllUserNotifications,
};
