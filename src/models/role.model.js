const mongoose = require("mongoose");
const { Schema } = mongoose;

const roleSchema = new Schema(
  {
    name: { type: String, required: true },
    role: { type: String, required: true },
    is_delete: { type: Boolean, required: true, default: true },
    details: { type: String, required: true },
    permissions: [],
  },
  { timestamps: true }
);

const Role = mongoose.model("Role", roleSchema);

module.exports = Role;
