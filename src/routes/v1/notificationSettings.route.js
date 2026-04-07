const express = require("express");

const router = express.Router();
const {
  createNotificationSettings,
  getNotificationSettingsByUserId,
  updateNotificationSettingsByUserId,
  deleteNotificationSettingsByUserId,
} = require("../../controllers/NotificationSetting.controller");

// Route to create new notification settings
router.post("/", createNotificationSettings);

// Route to get notification settings by user ID
router.get("/:userId", getNotificationSettingsByUserId);

// Route to update notification settings by user ID
router.patch("/:userId", updateNotificationSettingsByUserId);

// Route to delete notification settings by user ID
router.delete("/:userId", deleteNotificationSettingsByUserId);

module.exports = router;
