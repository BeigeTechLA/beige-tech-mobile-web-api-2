const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    module_name: { type: String, required: true, unique: true },
    permissions: [
      {
        key: { type: String, required: true, unique: true },
        name: { type: String, required: true, unique: true },
        status: { type: Boolean, required: true },
      },
    ],
    order: { type: Number, required: true }
  },
  { timestamps: true }
);

const Permission = mongoose.model("Permissions", permissionSchema);

module.exports = Permission;
