const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const priceSchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  rate: {
    type: Number,
    required: true,
  },
  tag: {
    type: String,
    required: true,
  },
  status: {
    type: Number,
    default: 1,
    required: true,
  },
});
priceSchema.plugin(toJSON);
priceSchema.plugin(paginate);
const Price = mongoose.model("price", priceSchema);
module.exports = Price;
