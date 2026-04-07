const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["cp", "admin"],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'createdByModel'
    },
    createdByModel: {
      type: String,
      required: true,
      enum: ['User', 'CP']
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
      required: false,
    },
    order: {
      type: Number,
      default: 0,
      required: false,
    },
    category: {
      type: String,
      required: false,
      trim: true,
    },
    tags: {
      type: [String],
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Add plugins
faqSchema.plugin(toJSON);
faqSchema.plugin(paginate);

// Add indexes for better performance
faqSchema.index({ type: 1, status: 1 });
faqSchema.index({ createdBy: 1 });
faqSchema.index({ isPublic: 1, status: 1 });

/**
 * @typedef FAQ
 */
const FAQ = mongoose.model("FAQ", faqSchema);

module.exports = FAQ;
