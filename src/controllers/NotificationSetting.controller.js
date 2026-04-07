const NotificationSettings = require("../models/notificationSettings.model");

// Create new notification settings
const createNotificationSettings = async (req, res) => {
  try {
    const newSettings = new NotificationSettings(req.body);
    await newSettings.save();
    res.status(201).json(newSettings);
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error creating notification settings: " + error.message,
      });
  }
};

// Get notification settings by user ID
const getNotificationSettingsByUserId = async (req, res) => {
  try {
    const settings = await NotificationSettings.findOne({
      userId: req.params.userId,
    });
    if (!settings) {
      return res
        .status(404)
        .json({ message: "Notification settings not found" });
    }
    res.status(200).json(settings);
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error fetching notification settings: " + error.message,
      });
  }
};

// Update notification settings by user ID
const updateNotificationSettingsByUserId = async (req, res) => {
  try {
    const updatedSettings = await NotificationSettings.findOneAndUpdate(
      { userId: req.params.userId },
      req.body,
      { new: true }
    );
    if (!updatedSettings) {
      return res
        .status(404)
        .json({ message: "Notification settings not found" });
    }
    res.status(200).json(updatedSettings);
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error updating notification settings: " + error.message,
      });
  }
};

// Delete notification settings by user ID
const deleteNotificationSettingsByUserId = async (req, res) => {
  try {
    const deletedSettings = await NotificationSettings.findOneAndDelete({
      userId: req.params.userId,
    });
    if (!deletedSettings) {
      return res
        .status(404)
        .json({ message: "Notification settings not found" });
    }
    res
      .status(200)
      .json({ message: "Notification settings deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Error deleting notification settings: " + error.message,
      });
  }
};

module.exports = {
  createNotificationSettings,
  getNotificationSettingsByUserId,
  updateNotificationSettingsByUserId,
  deleteNotificationSettingsByUserId,
};
