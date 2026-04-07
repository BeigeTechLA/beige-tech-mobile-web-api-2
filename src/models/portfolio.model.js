const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const portfolioSchema = mongoose.Schema(
  {
    portfolioName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    specialities: {
      type: [String],
      required: false,
      default: [],
    },
    location: {
      type: String,
      required: false,
      trim: true,
    },
    eventDate: {
      type: Date,
      required: false,
    },
    description: {
      type: String,
      required: false,
      trim: true,
    },
    mediaFiles: {
      type: [String],
      required: false,
      default: [],
    },
    cpId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CP",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
portfolioSchema.index({ cpId: 1, createdAt: -1 });
portfolioSchema.index({ createdBy: 1, createdAt: -1 });
portfolioSchema.index({ isActive: 1, createdAt: -1 });

// add plugin that converts mongoose to json
portfolioSchema.plugin(toJSON);
portfolioSchema.plugin(paginate);

/**
 * @typedef Portfolio
 */
const Portfolio = mongoose.model("Portfolio", portfolioSchema);

module.exports = Portfolio;

