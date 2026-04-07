const httpStatus = require("http-status");
const mongoose = require("mongoose");
const catchAsync = require("../utils/catchAsync");
const { DbTest } = require("../models");

const createDbTestEntry = catchAsync(async (req, res) => {
  const payload = {
    name: req.body.name || "MongoDB Test",
    message:
      req.body.message || "This document was created to verify MongoDB inserts.",
    source: req.body.source || "manual-api-test",
  };

  const entry = await DbTest.create(payload);

  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Test document saved to MongoDB successfully.",
    collection: "db_test_entries",
    dbConnectionState: mongoose.connection.readyState,
    data: entry,
  });
});

const getDbTestEntries = catchAsync(async (req, res) => {
  const entries = await DbTest.find().sort({ createdAt: -1 }).limit(20);

  res.status(httpStatus.OK).json({
    success: true,
    count: entries.length,
    collection: "db_test_entries",
    data: entries,
  });
});

module.exports = {
  createDbTestEntry,
  getDbTestEntries,
};
