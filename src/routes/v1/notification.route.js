const express = require("express");
const notificationController = require("../../controllers/notification.controller");
const auth = require("../../middlewares/auth");

const router = express.Router();

// ========== Creation Routes ==========

// Create a new notification using the new schema

router
  .route("/")
  .post(auth(), notificationController.insertNotification)
  .get(auth(), notificationController.getNotifications);

// Create a notification using the legacy format (for backward compatibility)
router
  .route("/legacy")
  .post(auth(), notificationController.createNotification);

// ========== Debug Routes (TEMPORARY - NO AUTH) ==========
// NOTE: Remove these routes in production!

// Test creating a notification
router.post("/debug/test-create", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const { Notification } = require("../../models");
    const testNotification = await Notification.create({
      modelName: "TestChatMessage",
      modelId: new mongoose.Types.ObjectId(),
      category: "newMessage",
      message: "Test message notification created via debug endpoint",
      clientId: req.body.clientId || null,
      cpIds: req.body.cpIds || [],
      managerIds: [],
      metadata: {
        type: "newMessage",
        title: "New Message Test",
        createdAt: new Date().toISOString(),
      },
    });
    res.json({
      success: true,
      notification: testNotification,
    });
  } catch (error) {
    console.error("Debug create error:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Get all notifications without any filter - for debugging
router.get("/debug/all", async (req, res) => {
  try {
    const { Notification } = require("../../models");
    const allNotifications = await Notification.find({}).sort({ createdAt: -1 }).limit(50);

    // Group by category for easier viewing
    const categories = {};
    allNotifications.forEach(n => {
      const cat = n.category || 'unknown';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat]++;
    });

    res.json({
      total: allNotifications.length,
      categories: categories,
      notifications: allNotifications.map(n => ({
        id: n._id,
        category: n.category,
        modelName: n.modelName,
        message: n.message?.substring(0, 50),
        clientId: n.clientId,
        cpIds: n.cpIds,
        managerIds: n.managerIds,
        createdAt: n.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Query Routes ==========

// Get all notifications for the current user

router
  .route("/my")
  .get(auth(), notificationController.getMyNotifications);

// Get notifications by category
router
  .route("/category/:category")
  .get(auth(), notificationController.getNotificationsByCategory);

// Get notifications by model name and ID
router
  .route("/model/:modelName/:modelId")
  .get(auth(), notificationController.getNotificationsByModel);

// Get count of unread notifications for the current user
router
  .route("/unread-count")
  .get(auth(), notificationController.getUnreadCount);

// ========== Update Routes ==========

// Mark a notification as read

router
  .route("/:notificationId/read")
  .patch(auth(), notificationController.markAsRead);

// Mark all notifications as read for the current user
router
  .route("/mark-all-read")
  .patch(auth(), notificationController.markAllAsRead);

// ========== Delete Routes ==========

// Delete all notifications for a specific model and ID

router
  .route("/model/:modelName/:modelId")
  .delete(auth(), notificationController.deleteNotificationsByModel);

// ========== Individual Notification Routes ==========

// Get, update, or delete a specific notification
router
  .route("/:notificationId")
  .get(auth(), notificationController.getNotification)
  .patch(auth(), notificationController.updateNotification)
  .delete(auth(), notificationController.deleteNotification);

module.exports = router;
