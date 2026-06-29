const mongoose = require("mongoose");
const { toJSON } = require("./plugins");

const faceScanIndexJobSchema = new mongoose.Schema(
  {
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    externalId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    filepath: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    fileName: {
      type: String,
      default: "",
    },
    contentType: {
      type: String,
      default: "",
    },
    providerTimeoutMs: {
      type: Number,
      default: null,
    },
    forceIndex: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    lastResultStatus: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    queuedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

faceScanIndexJobSchema.index({ status: 1, queuedAt: 1 });
faceScanIndexJobSchema.index({ externalId: 1, status: 1, updatedAt: -1 });
faceScanIndexJobSchema.plugin(toJSON);

const FaceScanIndexJob = mongoose.model("FaceScanIndexJob", faceScanIndexJobSchema);

module.exports = FaceScanIndexJob;
