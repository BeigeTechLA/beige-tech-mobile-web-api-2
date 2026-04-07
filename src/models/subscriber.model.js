const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const subscriberSchema = mongoose.Schema(
  {
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    business_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone_number: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: { 
      createdAt: 'created_at', 
      updatedAt: 'updated_at' 
    },
  }
);

// add plugin that converts mongoose to json
subscriberSchema.plugin(toJSON);
subscriberSchema.plugin(paginate);

/**
 * @typedef Subscriber
 */
const Subscriber = mongoose.model("Subscriber", subscriberSchema);

module.exports = Subscriber;
