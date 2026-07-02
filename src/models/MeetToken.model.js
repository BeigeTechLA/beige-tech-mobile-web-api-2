const mongoose = require("mongoose");
const { toJSON } = require("./plugins");

const TokenSchema = new mongoose.Schema({
  access_token: String,
  refresh_token: String,
  scope: String,
  token_type: String,
  expiry_date: Number,
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  appUserEmail: { type: String, trim: true, lowercase: true },
  googleEmail: { type: String, trim: true, lowercase: true },
});

TokenSchema.index({ userId: 1, googleEmail: 1 });

// add plugin that converts mongoose to json
TokenSchema.plugin(toJSON);

/**
 * @typedef Token
 */
const MeetToken = mongoose.model("MeetToken", TokenSchema);

module.exports = MeetToken;
