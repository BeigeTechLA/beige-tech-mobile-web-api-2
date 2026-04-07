const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const ratingSchema = new mongoose.Schema(
  {
    rating: {
      type: Number,
      required: true,
      default: 0,
      max: [5, "Must be below 5, got {VALUE}"],
    },
    review: {
      type: String,
      required: false,
    },
    rating_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    rating_type: {
      type: String,
      required: true,
      enum: ["buyer_to_seller", "seller_to_buyer"],
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
ratingSchema.plugin(toJSON);
ratingSchema.plugin(paginate);

/**
 * @typedef Rating
 */
const Rating = mongoose.model("Rating", ratingSchema);

module.exports = Rating;
