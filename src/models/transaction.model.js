const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

/**
 * Transaction Model
 * Unified transaction history for all monetary events
 * Supports: Earnings (from orders), Withdrawals (payouts), Payments (client payments)
 */
const transactionSchema = new mongoose.Schema(
  {
    // Transaction type
    type: {
      type: String,
      enum: ["earning", "withdrawal", "payment"],
      required: true,
    },

    // Who is the transaction for (CP or Client)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Amount of the transaction
    amount: {
      type: Number,
      required: true,
    },

    // Transaction status
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
      required: true,
    },

    // Related order (for earnings and payments)
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
    },

    // Order name for display
    shootName: {
      type: String,
      required: false,
    },

    // Client information (for CP earnings view)
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    clientName: {
      type: String,
      required: false,
    },

    // Related payout (for withdrawals)
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "payout",
      required: false,
    },

    // Invoice ID (for withdrawals)
    invoiceId: {
      type: String,
      required: false,
    },

    // Transaction ID (for withdrawals)
    transactionId: {
      type: String,
      required: false,
    },

    // Payment method (for withdrawals and payments)
    paymentMethod: {
      type: String,
      required: false,
    },

    // Payment intent ID (for Stripe payments)
    paymentIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: false,
    },

    // Transaction date (when it occurred)
    transactionDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    // Description
    description: {
      type: String,
      required: false,
    },

    // Metadata for additional information
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ payoutId: 1 });

// Add plugins
transactionSchema.plugin(toJSON);
transactionSchema.plugin(paginate);

/**
 * @typedef Transaction
 */
const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
