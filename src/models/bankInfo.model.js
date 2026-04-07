const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

// Define the BankInfo schema
const bankInfoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  accountType: {
    type: String,
    enum: ["debitCard", "bankAccount"],
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
});

// add plugin that converts mongoose to json
bankInfoSchema.plugin(toJSON);
bankInfoSchema.plugin(paginate);
bankInfoSchema.index({ geo_location: "2dsphere" });

// Define the bankinfo model using the schema
const BankInfo = mongoose.model("bankInformation", bankInfoSchema);

// Export the Order model
module.exports = BankInfo;
