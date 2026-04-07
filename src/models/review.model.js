const mongoose = require("mongoose");
const { paginate, toJSON } = require("./plugins");

const reviewSchema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cp_ids: [
      {
        id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    rating: {
      type: Number,
      default: 2,
      min: 1,
      max: 5,
    },

    reviewText: {
      type: String,
      required: false,
    },
    review_status: {
      type: Boolean,
      status: false,
    },
  },
  {
    timestamps: true,
  }
);
reviewSchema.plugin(toJSON);
reviewSchema.plugin(paginate);
const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;
