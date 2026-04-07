const mongoose = require("mongoose");

const notificationSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  sms: {
    type: Boolean,
    default: true,
  },
  emailNotification: {
    type: Boolean,
    default: true,
  },
  popupNotification: {
    type: Boolean,
    default: true,
  },
  locationTracking: {
    type: Boolean,
    default: true,
  },
});

const NotificationSettings = mongoose.model(
  "NotificationSettings",
  notificationSettingsSchema
);

module.exports = NotificationSettings;
