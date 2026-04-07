const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const reviewRequestSchema = mongoose.Schema(
  {
    cpId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Add plugins
reviewRequestSchema.plugin(toJSON);
reviewRequestSchema.plugin(paginate);

// Add a compound index to prevent duplicate requests
reviewRequestSchema.index({ cpId: 1, orderId: 1 }, { unique: true });

/**
 * @typedef ReviewRequest
 */
const ReviewRequest = mongoose.model("ReviewRequest", reviewRequestSchema);

module.exports = ReviewRequest;
