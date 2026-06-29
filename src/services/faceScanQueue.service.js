const logger = require("../config/logger");
const { FaceScanJob, FaceScanIndexJob } = require("../models");

const FACE_SCAN_JOB_STALE_PROCESSING_MS = Math.max(
  60000,
  Number(process.env.FACE_SCAN_JOB_STALE_PROCESSING_MS || 15 * 60 * 1000)
);
const FACE_SCAN_INDEX_JOB_STALE_PROCESSING_MS = Math.max(
  60000,
  Number(
    process.env.FACE_SCAN_INDEX_JOB_STALE_PROCESSING_MS ||
      process.env.FACE_SCAN_JOB_STALE_PROCESSING_MS ||
      15 * 60 * 1000
  )
);
const FACE_SCAN_QUEUE_POLL_INTERVAL_MS = Math.max(
  500,
  Number(process.env.FACE_SCAN_QUEUE_POLL_INTERVAL_MS || 1500)
);
const FACE_SCAN_INDEX_QUEUE_POLL_INTERVAL_MS = Math.max(
  500,
  Number(process.env.FACE_SCAN_INDEX_QUEUE_POLL_INTERVAL_MS || FACE_SCAN_QUEUE_POLL_INTERVAL_MS)
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeQueueKey = (value) => String(value || "").trim().toLowerCase();
const normalizeQueueValue = (value) => String(value || "").trim();

const buildIndexDedupeKey = (job = {}) =>
  `${normalizeQueueKey(job.externalId)}::${normalizeQueueKey(job.filepath)}`;

const isConfigured = () => true;

const enqueueJob = async (jobId) => {
  if (!jobId) return false;
  const exists = await FaceScanJob.exists({ _id: jobId });
  return Boolean(exists);
};

const enqueueIndexJob = async (job = {}) => {
  if (!job?.externalId || !job?.filepath) return false;

  const dedupeKey = buildIndexDedupeKey(job);
  if (!dedupeKey || dedupeKey === "::") return false;

  const existing = await FaceScanIndexJob.findOne({ dedupeKey })
    .select("status")
    .lean();

  if (existing?.status === "queued" || existing?.status === "processing") {
    return true;
  }

  await FaceScanIndexJob.findOneAndUpdate(
    { dedupeKey },
    {
      $set: {
        dedupeKey,
        externalId: normalizeQueueValue(job.externalId),
        filepath: normalizeQueueValue(job.filepath),
        fileName: String(job.fileName || ""),
        contentType: String(job.contentType || ""),
        providerTimeoutMs: Number.isFinite(Number(job.providerTimeoutMs))
          ? Number(job.providerTimeoutMs)
          : null,
        forceIndex: !!job.forceIndex,
        status: "queued",
        lastResultStatus: null,
        errorMessage: null,
        queuedAt: new Date(),
        startedAt: null,
        completedAt: null,
      },
      $setOnInsert: {
        attempts: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return true;
};

const claimNextScanJob = async () => {
  const staleCutoff = new Date(Date.now() - FACE_SCAN_JOB_STALE_PROCESSING_MS);

  return FaceScanJob.findOneAndUpdate(
    {
      $or: [
        { status: "queued" },
        { status: "processing", startedAt: { $lte: staleCutoff } },
      ],
    },
    {
      $set: {
        status: "processing",
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { queuedAt: 1, createdAt: 1 },
      new: true,
    }
  );
};

const claimNextIndexJob = async () => {
  const staleCutoff = new Date(Date.now() - FACE_SCAN_INDEX_JOB_STALE_PROCESSING_MS);

  return FaceScanIndexJob.findOneAndUpdate(
    {
      $or: [
        { status: "queued" },
        { status: "processing", startedAt: { $lte: staleCutoff } },
      ],
    },
    {
      $set: {
        status: "processing",
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { queuedAt: 1, createdAt: 1 },
      new: true,
    }
  );
};

const markIndexJobCompleted = async (jobId, result = {}) => {
  await FaceScanIndexJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "completed",
        lastResultStatus: String(result?.status || "completed"),
        errorMessage: null,
        completedAt: new Date(),
      },
    }
  );
};

const markIndexJobFailed = async (jobId, error) => {
  await FaceScanIndexJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: "failed",
        lastResultStatus: "failed",
        errorMessage: String(error?.message || "Face index job failed").slice(0, 255),
        completedAt: new Date(),
      },
    }
  );
};

const runWorker = async (handler) => {
  logger.info("[face-scan-queue] scan worker listening on MongoDB queue");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const job = await claimNextScanJob();
      if (!job) {
        await sleep(FACE_SCAN_QUEUE_POLL_INTERVAL_MS);
        continue;
      }

      await handler(job);
    } catch (error) {
      logger.error("[face-scan-queue] scan worker loop error:", error);
      await sleep(1000);
    }
  }
};

const runIndexWorker = async (handler) => {
  logger.info("[face-scan-queue] index worker listening on MongoDB queue");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const job = await claimNextIndexJob();
      if (!job) {
        await sleep(FACE_SCAN_INDEX_QUEUE_POLL_INTERVAL_MS);
        continue;
      }

      try {
        const result = await handler(job);
        await markIndexJobCompleted(job._id, result);
      } catch (error) {
        await markIndexJobFailed(job._id, error);
        throw error;
      }
    } catch (error) {
      logger.error("[face-scan-queue] index worker loop error:", error);
      await sleep(1000);
    }
  }
};

const getQueueStats = async () => {
  const [scanJobs, indexJobs, processingIndexJobs] = await Promise.all([
    FaceScanJob.countDocuments({ status: "queued" }),
    FaceScanIndexJob.countDocuments({ status: "queued" }),
    FaceScanIndexJob.countDocuments({ status: "processing" }),
  ]);

  return {
    configured: true,
    backend: "mongo",
    scanJobs,
    indexJobs,
    processingIndexJobs,
  };
};

module.exports = {
  enqueueIndexJob,
  enqueueJob,
  getQueueStats,
  isConfigured,
  runIndexWorker,
  runWorker,
};
