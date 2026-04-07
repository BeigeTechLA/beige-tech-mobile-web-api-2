const mongoose = require("mongoose");

const addOnsSchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  rate: {
    type: Number,
    required: true,
  },
  ExtendRateType: {
    type: String,
    enum: ["hourly", "day", "fixed"],
    required: false,
  },
  ExtendRate: {
    type: Number,
    required: false,
  },
  info: {
    type: String,
    required: false,
  },
  status: {
    type: Number,
    default: 1,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
});

const AddOns = mongoose.model("addOns", addOnsSchema);
module.exports = AddOns;
