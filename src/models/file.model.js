const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

// Define the file schema
const fileSchema = new mongoose.Schema(
  {
    original_name: {
      type: String,
    },
    file_name: {
      type: String,
      required: true,
    },
    file_path: {
      type: String,
    },
    local_path: {
      type: String,
    },
    file_extension: {
      type: String,
    },
    file_type: {
      type: String,
      enum: ["Raw", "Edited"],
    },
    size: {
      type: Number,
      default: 0,
    },
    order_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "Order",
    },
    content_type: {
      type: String,
      enum: ["Photo", "Video"],
    },
    shoot_date: {
      type: Date,
    },
    privacy: {
      type: String,
      required: true,
      enum: ["Private", "Public"],
    },
    download_url: {
      type: String,
    },
    review_status: {
      type: String,
      enum: ["Pending", "Reviewed"],
      default: "Pending",
    },
    status: {
      type: String,
      enum: ["Pending", "Completed"],
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Add plugin that converts mongoose document to JSON format
fileSchema.plugin(toJSON);

// Add plugin for pagination support
fileSchema.plugin(paginate);

// Create the "File" model using the file schema
const File = mongoose.model("File", fileSchema);

module.exports = File;
