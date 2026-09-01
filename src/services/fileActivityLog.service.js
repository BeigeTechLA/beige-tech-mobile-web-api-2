const { FileActivityLog } = require("../models");

const normalizeStage = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/-/g, "_");

  if (["pre", "pre_production", "preproduction"].includes(normalized)) {
    return "pre_production";
  }

  if (["post", "post_production", "postproduction"].includes(normalized)) {
    return "post_production";
  }

  return null;
};

const inferStageFromPath = (folderPath) => {
  const segments = String(folderPath || "")
    .split("/")
    .map((segment) => segment.trim().toLowerCase().replace(/-/g, "_"))
    .filter(Boolean);

  if (segments.includes("pre_production") || segments.includes("preproduction")) {
    return "pre_production";
  }

  if (segments.includes("post_production") || segments.includes("postproduction")) {
    return "post_production";
  }

  return null;
};

const toValidDate = (value) => {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const createFileActivityLog = async ({
  clientId,
  clientName,
  action,
  folderName,
  folderPath,
  stage,
  performedBy,
}) => {
  if (!["created", "deleted"].includes(action) || !folderName || !folderPath) {
    return null;
  }

  return FileActivityLog.create({
    clientId: clientId ? String(clientId) : null,
    clientName: clientName ? String(clientName) : null,
    action,
    folderName,
    folderPath,
    stage: normalizeStage(stage) || inferStageFromPath(folderPath),
    performedBy: performedBy ? String(performedBy) : null,
  });
};

const queryFileActivityLogs = async (filters = {}, options = {}) => {
  const query = {};

  if (filters.clientId) {
    query.clientId = String(filters.clientId);
  }

  const stage = normalizeStage(filters.stage);
  if (stage) {
    query.stage = stage;
  }

  const action = String(filters.action || "").trim().toLowerCase();
  if (["created", "deleted"].includes(action)) {
    query.action = action;
  }

  const createdAt = {};
  const startDate = toValidDate(filters.startDate);
  const endDate = toValidDate(filters.endDate);
  if (startDate) {
    createdAt.$gte = startDate;
  }
  if (endDate) {
    createdAt.$lte = endDate;
  }
  if (Object.keys(createdAt).length) {
    query.createdAt = createdAt;
  }

  return FileActivityLog.paginate(query, {
    page: options.page,
    limit: options.limit,
    sortBy: options.sortBy || "createdAt:desc",
  });
};

module.exports = {
  createFileActivityLog,
  queryFileActivityLogs,
  inferStageFromPath,
  normalizeStage,
};
