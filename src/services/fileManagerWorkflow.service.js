const httpStatus = require("http-status");
const { FileMeta, FileActivityLog, FileManagerWorkflow } = require("../models");
const { bucket } = require("./gcpFile.service");
const { ALLOWED_TRANSITIONS } = require("../constants/fileManagerWorkflow");

const clean = (value) => String(value || "").trim().replace(/^\/+|\/+$/g, "");
const esc = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fail = (message, status = httpStatus.BAD_REQUEST) => Object.assign(new Error(message), { status, statusCode: status });
const rootFor = async (orderId) => FileMeta.findOne({ isFolder: true, parentFolderId: null, path: { $regex: /^[^/]+\/?$/ }, "metadata.orderId": clean(orderId) }).sort({ updatedAt: -1 }).lean();
const pathsFor = (root) => ({
  selected: `${root}/Post-Production/Edits/Selected for Edits/`,
  edited: `${root}/Post-Production/Edits/Edited Deliverables/`,
  revisions: `${root}/Post-Production/Edits/Revisions/`,
});
const fileQuery = (prefix, extra = {}) => ({ isFolder: false, path: { $regex: `^${esc(prefix)}` }, ...extra });

const getOrCreateWorkflow = async (orderId) => {
  const normalized = clean(orderId);
  if (!normalized) throw fail("orderId is required");
  return FileManagerWorkflow.findOneAndUpdate({ orderId: normalized }, { $setOnInsert: { orderId: normalized } }, { upsert: true, new: true, setDefaultsOnInsert: true });
};

const recordActivity = async (orderId, action, { by, byName, note, fileCount = 0, version, status } = {}) => {
  const root = await rootFor(orderId);
  if (!root) return null;
  return FileActivityLog.create({ folderPath: `${clean(root.path)}/Post-Production/Edits/`, rootPath: `${clean(root.path)}/`, action, actorUserId: by || null, actorName: byName ?? null, fileCount, metadata: { note: note || "", version: version ?? null, status: status || null, orderId: clean(orderId) } });
};

const transition = async (orderId, toStatus, { by, byName, note } = {}) => {
  const workflow = await getOrCreateWorkflow(orderId);
  if (!(ALLOWED_TRANSITIONS[workflow.status] || []).includes(toStatus)) throw fail(`Invalid workflow transition: ${workflow.status} -> ${toStatus}`);
  if (toStatus === "revision_requested" && workflow.requirements.revisionRounds != null && workflow.revisionCycle >= workflow.requirements.revisionRounds) throw fail("The configured revision-round limit has been reached");
  const now = new Date();
  const from = workflow.status;
  workflow.status = toStatus;
  workflow.statusHistory.push({ from, to: toStatus, by: by || null, byName: byName ?? null, at: now, note: note || "" });
  if (toStatus === "in_progress") workflow.startedAt = workflow.startedAt || now;
  if (["submitted", "resubmitted"].includes(toStatus)) workflow.submittedAt = now;
  if (toStatus === "approved") workflow.approvedAt = now;
  if (toStatus === "completed") workflow.completedAt = now;
  if (toStatus === "revision_requested") { workflow.revisionCycle += 1; workflow.currentRevisionVersion = workflow.revisionCycle + 1; }
  await workflow.save();
  const action = { in_progress: "start_editing", submitted: "submit_approval", resubmitted: "submit_revision", revision_requested: "request_revision", approved: "approve", completed: "complete" }[toStatus];
  if (action) await recordActivity(orderId, action, { by, byName, note, version: workflow.currentRevisionVersion, status: toStatus });
  return workflow;
};

const computeDeliverableProgress = async (orderId) => {
  const workflow = await getOrCreateWorkflow(orderId);
  const root = await rootFor(orderId);
  if (!root) return { uploaded: 0, required: Number(workflow.requirements.requiredCount || 0), remaining: Number(workflow.requirements.requiredCount || 0), percent: 0, label: "not_started" };
  const p = pathsFor(clean(root.path));
  const [selected, uploaded] = await Promise.all([FileMeta.countDocuments(fileQuery(p.selected)), FileMeta.countDocuments(fileQuery(p.edited))]);
  const required = Number(workflow.requirements.requiredCount ?? selected);
  const percent = required ? Math.round((uploaded / required) * 100) : 0;
  return { uploaded, required, remaining: Math.max(required - uploaded, 0), percent, label: uploaded === 0 ? "not_started" : uploaded >= required && required > 0 ? "completed" : "uploading" };
};

const computeRevisionProgress = async (orderId, version) => {
  const workflow = await getOrCreateWorkflow(orderId);
  const root = await rootFor(orderId);
  const requestedVersion = Number(version || workflow.currentRevisionVersion || workflow.revisionCycle + 1);
  if (!root) return { version: requestedVersion, required: 0, uploaded: 0, percent: 0 };
  const p = pathsFor(clean(root.path));
  const [required, uploaded] = await Promise.all([
    FileMeta.countDocuments({ isFolder: false, "metadata.orderId": clean(orderId), "metadata.editStatus": "revision_requested", "metadata.requestedNextVersion": requestedVersion }),
    FileMeta.countDocuments(fileQuery(`${p.revisions}Version${requestedVersion}/`)),
  ]);
  return { version: requestedVersion, required, uploaded, percent: required ? Math.round((uploaded / required) * 100) : 0 };
};

const computeNextAction = (workflow, progress, selectedCount = 0) => {
  if (workflow.status === "not_started") return selectedCount ? { code: "start_editing", text: "Editing is ready to start", ctaLabel: "Start Editing", ctaAction: "start-editing" } : { code: "select_files", text: "Select files from Raw Footage", ctaLabel: "Select Files", ctaAction: "select-files" };
  if (workflow.status === "in_progress") {
    const required = Number(progress.required || selectedCount || 0);
    if (progress.uploaded > 0 && (!required || progress.uploaded >= required)) return { code: "send_for_approval", text: "Deliverables are ready for approval", ctaLabel: "Send for Approval", ctaAction: "submit-approval" };
    return { code: "upload_deliverables", text: `${progress.uploaded} of ${required} edited files uploaded`, ctaLabel: "Upload Files", ctaAction: "upload" };
  }
  if (["submitted", "resubmitted"].includes(workflow.status)) return { code: "wait_for_review", text: "Waiting for review", ctaLabel: null, ctaAction: null };
  if (workflow.status === "revision_requested") return { code: "upload_revision", text: "Download revision files and upload the next version", ctaLabel: "Upload Revision", ctaAction: "submit-revision" };
  if (workflow.status === "approved") return { code: "complete", text: "Move approved files to final deliverables and complete", ctaLabel: "Complete", ctaAction: "complete" };
  return { code: "none", text: "Workflow completed", ctaLabel: null, ctaAction: null };
};

const getStorageUsage = async (scope = {}) => {
  const match = { isFolder: false }; if (scope.orderId) match["metadata.orderId"] = clean(scope.orderId);
  const [summary] = await FileMeta.aggregate([{ $match: match }, { $group: { _id: null, usedBytes: { $sum: "$size" } } }]);
  const totalBytes = Number(process.env.FILE_MANAGER_STORAGE_QUOTA_BYTES || 100 * 1024 * 1024 * 1024);
  const usedBytes = Number(summary?.usedBytes || 0);
  return { usedBytes, totalBytes, percent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0 };
};

const buildTimeline = (workflow) => {
  const steps = [["not_started", "Files selected"], ["in_progress", "Editing"], ["submitted", "Submitted for approval"], ["revision_requested", "Revision requested"], ["resubmitted", "Revision submitted"], ["approved", "Approved"], ["completed", "Completed"]];
  const current = steps.findIndex(([status]) => status === workflow.status);
  return steps.map(([status, label], index) => ({ status, label, done: index < current || workflow.status === "completed", current: index === current }));
};

const revisionVersionFromPath = (path) => Number(String(path || "").match(/\/Revisions\/Version(\d+)\//i)?.[1] || 0);

const hasPendingReview = async (orderId) => {
  const [workflow, root] = await Promise.all([getOrCreateWorkflow(orderId), rootFor(orderId)]);
  if (!root) return false;

  const p = pathsFor(clean(root.path));
  const currentVersion = Number(workflow.currentRevisionVersion || 0);
  const pendingStatuses = ["waiting_for_approval", "revision_requested", "version_pending"];
  const reviewPaths = [`^${esc(p.edited)}`];
  if (currentVersion) reviewPaths.push(`^${esc(`${p.revisions}Version${currentVersion}/`)}`);
  const pendingFiles = await FileMeta.find({
    isFolder: false,
    path: { $regex: `(${reviewPaths.join("|")})` },
    "metadata.editStatus": { $in: pendingStatuses },
  }).lean();
  if (!pendingFiles.length) return false;

  const names = [...new Set(pendingFiles.map((file) => file.name).filter(Boolean))];
  const approvedRevisions = await FileMeta.find({
    isFolder: false,
    path: { $regex: `^${esc(p.revisions)}Version\\d+/` },
    name: { $in: names },
    "metadata.editStatus": "approved",
  }).select({ name: 1, path: 1 }).lean();
  const latestApprovedVersion = approvedRevisions.reduce((versions, file) => {
    const version = revisionVersionFromPath(file.path);
    versions.set(file.name, Math.max(versions.get(file.name) || 0, version));
    return versions;
  }, new Map());

  return pendingFiles.some((file) => {
    const fileVersion = revisionVersionFromPath(file.path) || Number(file.metadata?.uploadedVersion || file.metadata?.currentVersion || 1);
    if ((latestApprovedVersion.get(file.name) || 0) > fileVersion) return false;
    const isEditedDeliverable = file.path.startsWith(p.edited);
    return !(workflow.status === "resubmitted" && isEditedDeliverable && file.metadata?.editStatus === "waiting_for_approval");
  });
};

const signedViewUrl = async (path) => { if (!bucket || !path) return null; const [url] = await bucket.file(`Website_Shoots_Flow/${path}`).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60 * 60 * 1000 }); return url; };
const getBeforeAfter = async (orderId, filePath) => {
  const root = await rootFor(orderId); const path = clean(filePath);
  if (!root || !path.startsWith(`${clean(root.path)}/`)) throw fail("File path is outside this workspace", httpStatus.FORBIDDEN);
  const requested = await FileMeta.findOne({ path, isFolder: false }).lean(); if (!requested) throw fail("File not found", httpStatus.NOT_FOUND);
  const originalPath = requested.metadata?.copiedFrom || requested.metadata?.originalPath || path;
  const original = await FileMeta.findOne({ path: originalPath, isFolder: false }).lean() || requested;
  const paths = pathsFor(clean(root.path));
  const editedPathPattern = `^(${esc(paths.edited)}|${esc(paths.revisions)}Version\\d+/)`;
  const edited = await FileMeta.findOne({
    isFolder: false,
    path: { $regex: editedPathPattern },
    $or: [
      { "metadata.copiedFrom": original.path },
      { "metadata.originalPath": original.path },
      { name: original.name },
    ],
  }).sort({ "metadata.uploadedVersion": -1, "metadata.currentVersion": -1, updatedAt: -1 }).lean() || requested;
  const workflow = await getOrCreateWorkflow(orderId);
  return { original: original ? { path: original.path, version: Number(original.metadata?.currentVersion || 0), url: await signedViewUrl(original.path) } : null, edited: { path: edited.path, version: Number(edited.metadata?.uploadedVersion || edited.metadata?.currentVersion || 1), url: await signedViewUrl(edited.path) }, revisionNotes: workflow.submissions.filter((item) => item.type === "revision").map((item) => ({ version: item.version, notes: item.notes, at: item.at })) };
};

module.exports = { getOrCreateWorkflow, transition, computeDeliverableProgress, computeRevisionProgress, computeNextAction, getStorageUsage, buildTimeline, getBeforeAfter, hasPendingReview, recordActivity, rootFor, pathsFor };
