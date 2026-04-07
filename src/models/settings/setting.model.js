const mongoose = require("mongoose");
const { toJSON } = require("../plugins");

const settingsSchema = new mongoose.Schema({
  allowOrderWithoutCp: {
    type: Boolean,
    default: false,
    required: false,
  },
  predefineCp: {
    type: Boolean,
    default: false,
    required: false,
  },
  // Add more settings fields as needed
});
// Apply the toJSON plugin to the settingsSchema
settingsSchema.plugin(toJSON);
const Settings = mongoose.model("Settings", settingsSchema);

module.exports = Settings;
