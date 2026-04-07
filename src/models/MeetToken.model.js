const mongoose = require("mongoose");
const { toJSON } = require("./plugins");

const TokenSchema = new mongoose.Schema({
  access_token: String,
  refresh_token: String,
  scope: String,
  token_type: String,
  expiry_date: Number,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

// add plugin that converts mongoose to json
TokenSchema.plugin(toJSON);

/**
 * @typedef Token
 */
const MeetToken = mongoose.model("MeetToken", TokenSchema);

module.exports = MeetToken;
