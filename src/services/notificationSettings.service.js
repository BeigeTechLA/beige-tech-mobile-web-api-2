const NotificationSettings = require("../models/notificationSettings.model");

// Create new notification settings
const createNotificationSettings = async (settingsData) => {
  try {
    const newSettings = new NotificationSettings(settingsData);
    await newSettings.save();
    return newSettings;
  } catch (error) {
    throw new Error("Error creating notification settings: " + error.message);
  }
};
// Create default notification settings for a new user
const createDefaultNotificationSettings = async (userId) => {
  try {
    const defaultSettings = {
      userId,
      sms: true,
      emailNotification: true,
      popupNotification: true,
      locationTracking: true,
    };
    const newSettings = new NotificationSettings(defaultSettings);
    await newSettings.save();
    return newSettings;
  } catch (error) {
    throw new Error(
      "Error creating default notification settings: " + error.message
    );
  }
};

// Get notification settings by user ID
const getNotificationSettingsByUserId = async (userId) => {
  try {
    const settings = await NotificationSettings.findOne({ userId });
    return settings;
  } catch (error) {
    throw new Error("Error fetching notification settings: " + error.message);
  }
};

// Update notification settings by user ID
const updateNotificationSettingsByUserId = async (userId, updateData) => {
  try {
    const updatedSettings = await NotificationSettings.findOneAndUpdate(
      { userId },
      updateData,
      { new: true }
    );
    return updatedSettings;
  } catch (error) {
    throw new Error("Error updating notification settings: " + error.message);
  }
};

// Delete notification settings by user ID
const deleteNotificationSettingsByUserId = async (userId) => {
  try {
    await NotificationSettings.findOneAndDelete({ userId });
    return { message: "Notification settings deleted successfully" };
  } catch (error) {
    throw new Error("Error deleting notification settings: " + error.message);
  }
};

module.exports = {
  createNotificationSettings,
  getNotificationSettingsByUserId,
  updateNotificationSettingsByUserId,
  deleteNotificationSettingsByUserId,
  createDefaultNotificationSettings,
};
