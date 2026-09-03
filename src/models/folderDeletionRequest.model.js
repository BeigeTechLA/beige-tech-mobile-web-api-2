const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const folderDeletionRequestSchema = new mongoose.Schema(
  {
    folder_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "FileMeta",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    requested_by_user_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    project_id: {
      type: String,
      default: null,
      index: true,
    },
    event_id: {
      type: String,
      default: null,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "NA",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
      index: true,
    },
    file_count: {
      type: Number,
      default: 0,
    },
    total_size_bytes: {
      type: Number,
      default: 0,
    },
    requested_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reviewed_by_user_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "User",
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    reject_reason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

folderDeletionRequestSchema.index({ folder_id: 1, requested_at: -1 });
folderDeletionRequestSchema.index({ status: 1, requested_at: -1 });
folderDeletionRequestSchema.index({ title: "text", reason: "text", description: "text" });

folderDeletionRequestSchema.plugin(toJSON);
folderDeletionRequestSchema.plugin(paginate);

const FolderDeletionRequest = mongoose.model("FolderDeletionRequest", folderDeletionRequestSchema);

module.exports = FolderDeletionRequest;
