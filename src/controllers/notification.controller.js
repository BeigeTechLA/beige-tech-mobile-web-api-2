const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { notificationService } = require("../services");
const ApiError = require("../utils/ApiError");
const pick = require("../utils/pick");
const mongoose = require("mongoose");

// Helper to safely convert string to ObjectId
const toObjectId = (id) => {
  try {
    if (mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return id;
  } catch (error) {
    return id;
  }
};

/**
 * Insert a new notification
 */
const insertNotification = catchAsync(async (req, res) => {
  const notification = await notificationService.insertNotification(req.body);
  res.status(httpStatus.CREATED).send(notification);
});

/**
 * Legacy method for backward compatibility
 */
const createNotification = catchAsync(async (req, res) => {
  const notification = await notificationService.createNotification(req.body);
  res.status(httpStatus.CREATED).send(notification);
});

/**
 * Get all notifications with pagination
 * Supports role-based filtering via query params: clientId, cpId, adminId, managerId
 */
const getNotifications = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const filter = pick(requestQuery, ["modelName", "modelId", "category", "isRead"]);

  console.log('[Notification Controller] getNotifications called with query:', JSON.stringify(requestQuery));
  console.log('[Notification Controller] User from auth:', req.user ? { id: req.user._id, role: req.user.role } : 'No user');

  // Apply role-based filtering from query params
  // This allows frontend to pass the appropriate filter based on user role
  if (requestQuery.clientId) {
    filter.clientId = toObjectId(requestQuery.clientId);
    console.log('[Notification Controller] Filtering by clientId:', requestQuery.clientId);
  } else if (requestQuery.cpId) {
    filter.cpIds = toObjectId(requestQuery.cpId);
    console.log('[Notification Controller] Filtering by cpId:', requestQuery.cpId);
  } else if (requestQuery.managerId) {
    filter.managerIds = toObjectId(requestQuery.managerId);
    console.log('[Notification Controller] Filtering by managerId:', requestQuery.managerId);
  } else if (requestQuery.adminId) {
    // Admin sees all notifications EXCEPT ones they created themselves
    // (if you create a meeting, you shouldn't see your own invitation notification)
    filter['metadata.createdBy'] = { $ne: requestQuery.adminId };
    console.log('[Notification Controller] Admin mode - excluding notifications created by:', requestQuery.adminId);
  } else if (req.user) {
    // Fallback to req.user if no query params provided
    const userRole = req.user.role?.toLowerCase();
    if (userRole === 'user' || userRole === 'client') {
      filter.clientId = req.user._id;
      console.log('[Notification Controller] Fallback to user clientId:', req.user._id);
    } else if (userRole === 'cp' || userRole === 'content_provider' || userRole === 'contentproducer') {
      filter.cpIds = req.user._id;
      console.log('[Notification Controller] Fallback to user cpId:', req.user._id);
    } else if (userRole === 'manager' || userRole === 'project_manager') {
      filter.managerIds = req.user._id;
      console.log('[Notification Controller] Fallback to user managerId:', req.user._id);
    }
    // Admin sees all - no filter
  }

  console.log('[Notification Controller] Final filter:', JSON.stringify(filter));

  const options = pick(requestQuery, ["sortBy", "limit", "page", "populate"]);
  const result = await notificationService.queryNotifications(filter, options);

  console.log('[Notification Controller] Query returned', result.totalResults, 'total results');

  res.send(result);
});

/**
 * Get a single notification by ID
 */
const getNotification = catchAsync(async (req, res) => {
  const notification = await notificationService.getNotificationById(
    req.params.notificationId
  );
  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, "Notification not found");
  }
  res.send(notification);
});

/**
 * Get notifications for the current user
 */
const getMyNotifications = catchAsync(async (req, res) => {
  const reqData = req.query;
  const notifications = await notificationService.getNotificationsForUser(reqData);
  res.send(notifications);
});

/**
 * Get notifications by category
 */
const getNotificationsByCategory = catchAsync(async (req, res) => {
  const { category } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;
  
  const notifications = await notificationService.getNotificationsByCategory(category, userId, userRole);
  res.send(notifications);
});

/**
 * Get notifications by model
 */
const getNotificationsByModel = catchAsync(async (req, res) => {
  const { modelName, modelId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;
  
  const notifications = await notificationService.getNotificationsByModel(modelName, modelId, userId, userRole);
  res.send(notifications);
});

/**
 * Mark all notifications as read for the current user
 */
const markAllAsRead = catchAsync(async (req, res) => {
  const userId = req.body.userId;
  const userRole = req.body.userRole;
  
  const result = await notificationService.markAllAsRead(userId, userRole);
  res.send(result);
});

/**
 * Get unread notification count for the current user
 * Supports role-based filtering via query params: clientId, cpId, adminId, managerId
 */
const getUnreadCount = catchAsync(async (req, res) => {
  const reqData = { ...req.query };

  // If no role-based query params provided, use req.user as fallback
  if (!reqData.clientId && !reqData.cpId && !reqData.adminId && !reqData.managerId && req.user) {
    const userRole = req.user.role?.toLowerCase();
    if (userRole === 'user' || userRole === 'client') {
      reqData.clientId = req.user._id;
    } else if (userRole === 'cp' || userRole === 'content_provider' || userRole === 'contentproducer') {
      reqData.cpId = req.user._id;
    } else if (userRole === 'manager' || userRole === 'project_manager') {
      reqData.managerId = req.user._id;
    } else if (userRole === 'admin') {
      reqData.adminId = req.user._id;
    }
  }

  // Convert string IDs to ObjectId if needed
  if (reqData.clientId && typeof reqData.clientId === 'string') {
    reqData.clientId = toObjectId(reqData.clientId);
  }
  if (reqData.cpId && typeof reqData.cpId === 'string') {
    reqData.cpId = toObjectId(reqData.cpId);
  }
  if (reqData.managerId && typeof reqData.managerId === 'string') {
    reqData.managerId = toObjectId(reqData.managerId);
  }

  const count = await notificationService.getUnreadCount(reqData);
  res.send({ count });
});

/**
 * Update a notification
 */
const updateNotification = catchAsync(async (req, res) => {
  const notification = await notificationService.updateNotificationById(
    req.params.notificationId,
    req.body
  );
  res.send(notification);
});

/**
 * Delete a notification
 */
const deleteNotification = catchAsync(async (req, res) => {
  await notificationService.deleteNotificationById(req.params.notificationId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Delete all notifications for a model
 */
const deleteNotificationsByModel = catchAsync(async (req, res) => {
  const { modelName, modelId } = req.params;
  const result = await notificationService.deleteNotificationsByModel(modelName, modelId);
  res.send(result);
});

/**
 * Mark a notification as read
 */
const markAsRead = catchAsync(async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.notificationId
  );
  res.send(notification);
});

module.exports = {
  // Creation methods
  insertNotification,
  createNotification, // Legacy
  
  // Query methods
  getNotifications,
  getNotification,
  getMyNotifications,
  getNotificationsByCategory,
  getNotificationsByModel,
  getUnreadCount,
  
  // Update methods
  updateNotification,
  markAsRead,
  markAllAsRead,
  
  // Delete methods
  deleteNotification,
  deleteNotificationsByModel,
};
