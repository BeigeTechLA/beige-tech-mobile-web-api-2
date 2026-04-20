const mongoose = require("mongoose");
const { toJSON } = require("./plugins");

const faceEmbeddingSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    filepath: {
      type: String,
      required: true,
      unique: true,
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
    embeddings: {
      type: [[Number]],
      default: [],
    },
    facesCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ready", "failed"],
      default: "ready",
      index: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    indexedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

faceEmbeddingSchema.index({ externalId: 1, status: 1, updatedAt: -1 });
faceEmbeddingSchema.plugin(toJSON);

const FaceEmbedding = mongoose.model("FaceEmbedding", faceEmbeddingSchema);

module.exports = FaceEmbedding;
