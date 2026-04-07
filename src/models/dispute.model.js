const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const disputeSchema = mongoose.Schema(
  {
    status: {
      type: String,
      default: "pending",
      required: true,
      enum: ["pending", "approved", "rejected"],
    },
    order_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "Order",
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      required: true,
      enum: ["buyer_to_seller", "seller_to_buyer"],
    },
    fileUrls: {
      type: [String],
      default: [],
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
disputeSchema.plugin(toJSON);
disputeSchema.plugin(paginate);

/**
 * @typedef Dispute
 */

const Dispute = mongoose.model("Dispute", disputeSchema);

module.exports = Dispute;
