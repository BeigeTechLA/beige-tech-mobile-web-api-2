const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const serviceIncludesSchema = mongoose.Schema(
  {
    cpId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CP",
      required: true,
      index: true, // Index for faster queries by CP
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_at: {
      type: Date,
      default: Date.now,
      required: true,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

// Add plugins
serviceIncludesSchema.plugin(toJSON);
serviceIncludesSchema.plugin(paginate);

// Create compound index for efficient queries
serviceIncludesSchema.index({ cpId: 1, status: 1 });
serviceIncludesSchema.index({ cpId: 1, created_at: -1 });

/**
 * @typedef ServiceIncludes
 */
const ServiceIncludes = mongoose.model("ServiceIncludes", serviceIncludesSchema);

module.exports = ServiceIncludes;
