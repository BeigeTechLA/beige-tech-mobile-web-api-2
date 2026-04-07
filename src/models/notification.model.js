const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");
const Schema = mongoose.Schema;

const NotificationSchema = new Schema(
  {
    // Model-based categorization
    modelName: {
      type: String,
      required: true,
      index: true,
    },
    modelId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // Role-based access
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    cpIds: [{
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    }],
    managerIds: [{
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    }],
    // Notification content
    message: {
      type: String,
      required: true,
    },
    // Read status tracking
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      required: false,
    },
    // Category (same as modelName for simplicity)
    category: {
      type: String,
      required: true,
      index: true,
    },
    // For backward compatibility and future extensions
    metadata: {
      type: Object,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
NotificationSchema.index({ clientId: 1, isRead: 1 });
NotificationSchema.index({ cpIds: 1, isRead: 1 });
NotificationSchema.index({ managerIds: 1, isRead: 1 });
NotificationSchema.index({ category: 1, isRead: 1 });
NotificationSchema.index({ modelName: 1, modelId: 1 });

NotificationSchema.plugin(toJSON);
NotificationSchema.plugin(paginate);
module.exports = mongoose.model("Notification", NotificationSchema);
