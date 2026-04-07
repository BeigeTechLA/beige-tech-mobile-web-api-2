const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const noteSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add plugin that converts mongoose to json
noteSchema.plugin(toJSON);
noteSchema.plugin(paginate);

/**
 * @typedef Note
 */
const Note = mongoose.model("Note", noteSchema);

module.exports = Note;
