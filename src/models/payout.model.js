const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

// Define the BankInfo schema
const payoutSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accountType: {
      type: String,
      enum: ["Card", "bankAccount"],
      required: true,
    },
    accountHolder: {
      type: String,
      required: false,
    },
    accountNumber: {
      type: Number,
      required: false,
    },
    bankName: {
      type: String,
      required: false,
    },
    phoneNumber: {
      type: Number,
      required: false,
    },
    branchName: {
      type: String,
      required: false,
    },
    branchName: {
      type: String,
      required: false,
    },
    // card name
    cardNumber: {
      type: Number,
      required: false,
    },
    expireDate: {
      type: String,
      required: false,
    },
    cvc: {
      type: Number,
      required: false,
    },
    withdrawAmount: {
      type: Number,
      required: true,
    },
    //
    date: {
      type: Date,
      default: Date.now(),
      required: false,
    },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "canceled", "paid"],
      required: true,
    },
    invoiceId: {
      type: String,
      required: false,
    },
    transactionId: {
      type: String,
      required: false,
    },
    paymentDate: {
      type: Date,
      required: false,
    },
    paymentMethod: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
payoutSchema.plugin(toJSON);
payoutSchema.plugin(paginate);
payoutSchema.index({ geo_location: "2dsphere" });

// Define the bankinfo model using the schema
const Payout = mongoose.model("payout", payoutSchema);

// Export the Order model
module.exports = Payout;
