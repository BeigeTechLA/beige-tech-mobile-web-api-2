const mongoose = require("mongoose");
const config = require("../config/config");
const logger = require("../config/logger");
const faceScanQueueService = require("../services/faceScanQueue.service");
const externalFileManagerController = require("../controllers/externalFileManager.controller");

const start = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  logger.info("Face scan worker connected to MongoDB");

  await Promise.all([
    faceScanQueueService.runWorker(async (job) => {
      logger.info(`[face-scan-worker] processing scan job ${String(job?._id || "")}`);
      await externalFileManagerController.processFaceScanJob(job);
    }),
    faceScanQueueService.runIndexWorker(async (job) => {
      logger.info(`[face-scan-worker] processing index job ${job?.filepath || ""}`);
      await externalFileManagerController.processFaceIndexJob(job);
    }),
  ]);
};

start().catch((error) => {
  logger.error("[face-scan-worker] fatal error:", error);
  process.exit(1);
});
