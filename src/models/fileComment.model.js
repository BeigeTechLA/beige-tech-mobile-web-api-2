const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

/**
 * File Comment Schema
 * Schema for storing comments and replies on files
 */
const fileCommentSchema = mongoose.Schema(
  {
    fileMetaId: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Number, // Video timestamp in seconds
      default: null,
    },
    frameioCommentId: {
      type: String, // Original Frame.io comment ID (for synced comments)
      default: null,
      sparse: true,
    },
    frameioSyncedAt: {
      type: Date, // When comment was synced from Frame.io
      default: null,
    },
    parentId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "FileComment",
      default: null,
    },
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.Mixed,
          required: true,
        },
        type: {
          type: String,
          required: true,
          enum: ["like", "heart", "thumbsUp"],
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Add plugin that converts mongoose to json
fileCommentSchema.plugin(toJSON);
fileCommentSchema.plugin(paginate);

/**
 * @typedef FileComment
 */
const FileComment = mongoose.model("FileComment", fileCommentSchema);

module.exports = FileComment;
