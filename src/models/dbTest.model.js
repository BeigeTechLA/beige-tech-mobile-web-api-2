const mongoose = require("mongoose");
const { toJSON } = require("./plugins");

const dbTestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      default: "MongoDB Test",
    },
    message: {
      type: String,
      required: true,
      trim: true,
      default: "This document was created to verify MongoDB inserts.",
    },
    source: {
      type: String,
      trim: true,
      default: "manual-api-test",
    },
  },
  {
    timestamps: true,
    collection: "db_test_entries",
  }
);

dbTestSchema.plugin(toJSON);

const DbTest = mongoose.model("DbTest", dbTestSchema);

module.exports = DbTest;
