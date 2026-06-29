const mongoose = require("mongoose");
const { toJSON } = require("./plugins");

const faceScanJobSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    request: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
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

faceScanJobSchema.index({ externalId: 1, status: 1, createdAt: -1 });
faceScanJobSchema.plugin(toJSON);

const FaceScanJob = mongoose.model("FaceScanJob", faceScanJobSchema);

module.exports = FaceScanJob;
