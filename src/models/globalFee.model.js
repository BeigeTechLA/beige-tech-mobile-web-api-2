const mongoose = require("mongoose");
const { toJSON } = require("./plugins");

const globalFeeSchema = mongoose.Schema(
  {
    feeType: {
      type: String,
      enum: ["beige_margin", "platform_fee", "other"],
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    feeStructure: {
      type: String,
      enum: ["percentage", "fixed", "tiered"],
      required: true,
      default: "percentage",
    },
    // For percentage-based fees
    percentageValue: {
      type: Number,
      min: 0,
      max: 100,
      required: function () {
        return this.feeStructure === "percentage";
      },
    },
    // For fixed amount fees
    fixedAmount: {
      type: Number,
      min: 0,
      required: function () {
        return this.feeStructure === "fixed";
      },
    },
    // For tiered fee structures
    tiers: [
      {
        minAmount: {
          type: Number,
          min: 0,
        },
        maxAmount: {
          type: Number,
          min: 0,
        },
        percentage: {
          type: Number,
          min: 0,
          max: 100,
        },
        fixedFee: {
          type: Number,
          min: 0,
        },
      },
    ],
    currency: {
      type: String,
      default: "USD",
      enum: ["USD", "EUR", "GBP", "CAD"],
    },
    applicableTo: {
      type: [String],
      enum: ["all", "photography", "videography", "both", "specific_services"],
      default: ["all"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
    },
    notes: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Add plugin that converts mongoose to json
globalFeeSchema.plugin(toJSON);

// Index for efficient queries
globalFeeSchema.index({ feeType: 1, isActive: 1 });
globalFeeSchema.index({ effectiveFrom: 1, effectiveTo: 1 });

/**
 * @typedef GlobalFee
 */
const GlobalFee = mongoose.model("GlobalFee", globalFeeSchema);

module.exports = GlobalFee;
