const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const fileActivityLogSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      default: null,
      index: true,
    },
    clientName: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      enum: ["created", "deleted"],
      required: true,
      index: true,
    },
    folderName: {
      type: String,
      required: true,
    },
    folderPath: {
      type: String,
      required: true,
      index: true,
    },
    stage: {
      type: String,
      enum: ["pre_production", "post_production", null],
      default: null,
      index: true,
    },
    performedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "file_activity_logs",
  }
);

fileActivityLogSchema.index({ createdAt: -1 });
fileActivityLogSchema.index({ clientId: 1, stage: 1, action: 1, createdAt: -1 });

fileActivityLogSchema.plugin(toJSON);
fileActivityLogSchema.plugin(paginate);

const FileActivityLog = mongoose.model("FileActivityLog", fileActivityLogSchema);

module.exports = FileActivityLog;
