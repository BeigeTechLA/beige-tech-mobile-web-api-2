const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const fileActivityLogSchema = new mongoose.Schema(
  {
    folderPath: {
      type: String,
      required: true,
      index: true,
    },
    rootPath: {
      type: String,
      default: "",
      index: true,
    },
    action: {
      type: String,
      enum: ["upload", "delete", "deletion_request_approved", "deletion_request_rejected"],
      required: true,
      index: true,
    },
    actorUserId: {
      type: String,
      default: null,
      index: true,
    },
    actorName: {
      type: String,
      default: "Unknown",
    },
    actorEmail: {
      type: String,
      default: null,
    },
    fileCount: {
      type: Number,
      default: 0,
    },
    totalSize: {
      type: Number,
      default: 0,
    },
    targetPath: {
      type: String,
      default: "",
    },
    targetName: {
      type: String,
      default: "",
    },
    targetIsFolder: {
      type: Boolean,
      default: false,
    },
    files: {
      type: [
        {
          path: String,
          name: String,
          size: Number,
          contentType: String,
          isFolder: Boolean,
        },
      ],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

fileActivityLogSchema.index({ folderPath: 1, createdAt: -1 });
fileActivityLogSchema.index({ rootPath: 1, createdAt: -1 });
fileActivityLogSchema.index({ action: 1, actorUserId: 1, createdAt: -1 });

fileActivityLogSchema.plugin(toJSON);
fileActivityLogSchema.plugin(paginate);

const FileActivityLog = mongoose.model("FileActivityLog", fileActivityLogSchema);

module.exports = FileActivityLog;
