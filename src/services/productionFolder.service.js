const { FileMeta } = require("../models");

const PRODUCTION_FOLDER_FILTERS = {
  post_production_raw_footages: "raw_footages",
  post_production_edits: "edits",
  post_production_final_deliverables: "final_deliverables",
};

const FOLDER_RULES = {
  raw_footages: {
    candidateRegex: /(raw[-_ ]?footages?|postproduction_raw_footages?)/i,
    folderVariants: [
      "Post Production/Raw Footage",
      "Post Production/Raw Footages",
      "post-production/raw-footage",
      "post-production/raw-footages",
      "postproduction_raw_footage",
      "postproduction_raw_footages",
    ],
  },
  edits: {
    candidateRegex: /(edits|edited[-_ ]?footage|postproduction_edits|postproduction_edited_footage)/i,
    folderVariants: [
      "Post Production/Edits",
      "Post Production/Edited Footage",
      "post-production/edits",
      "post-production/edited-footage",
      "postproduction_edits",
      "postproduction_edited_footage",
    ],
  },
  final_deliverables: {
    candidateRegex: /(final[-_ ]?deliverables?|postproduction_final_deliverables?)/i,
    folderVariants: [
      "Post Production/Final Deliverables",
      "post-production/final-deliverables",
      "postproduction_final_deliverables",
    ],
  },
};

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return trimmed;
    }
  }

  return trimmed;
};

const firstValue = (...values) => {
  for (const value of values) {
    const parsed = parseMaybeJson(value);
    if (Array.isArray(parsed) && parsed.length) return parsed[0];
    if (parsed && typeof parsed === "object") {
      const nested = firstValue(
        parsed.orderId,
        parsed.stream_project_booking_id,
        parsed.projectId,
        parsed.bookingId,
        parsed.shoot_id
      );
      if (nested) return nested;
    }
    if (parsed !== undefined && parsed !== null && String(parsed).trim() !== "") return parsed;
  }

  return null;
};

const extractProjectId = (doc) => {
  const metadata = parseMaybeJson(doc?.metadata || {});
  return firstValue(
    metadata?.orderId,
    metadata?.stream_project_booking_id,
    metadata?.projectId,
    metadata?.bookingId,
    metadata?.shoot_id,
    doc?.orderId,
    doc?.projectId,
    doc?.bookingId,
    doc?.shoot_id,
    doc?.stream_project_booking_id
  );
};

const normalizePath = (value) =>
  String(value || "")
    .trim()
    .replace(/^https?:\/\/storage\.googleapis\.com\/[^/]+\//i, "")
    .replace(/^Website_Shoots_Flow\//i, "")
    .replace(/^shoots\//i, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();

const normalizeComparable = (value) =>
  normalizePath(value)
    .replace(/[ _-]+/g, " ")
    .replace(/\s*\/\s*/g, "/");

const pathCandidatesFor = (doc) =>
  [
    doc?.path,
    doc?.fullPath,
    doc?.key,
    doc?.fileName && String(doc.fileName).includes("/") ? doc.fileName : "",
    doc?.name && String(doc.name).includes("/") ? doc.name : "",
  ]
    .map(normalizePath)
    .filter(Boolean);

const isFolderLikeRow = (doc) =>
  doc?.isFolder === true || String(doc?.contentType || "").trim().toLowerCase() === "folder";

const childPathUnderVariant = (path, variant) => {
  const comparablePath = normalizeComparable(path);
  const comparableVariant = normalizeComparable(variant);

  if (!comparablePath || !comparableVariant || comparablePath === comparableVariant) return "";

  const directPrefix = `${comparableVariant}/`;
  if (comparablePath.startsWith(directPrefix)) {
    return comparablePath.slice(directPrefix.length);
  }

  const nestedNeedle = `/${comparableVariant}/`;
  const nestedIndex = comparablePath.indexOf(nestedNeedle);
  if (nestedIndex !== -1) {
    return comparablePath.slice(nestedIndex + nestedNeedle.length);
  }

  return "";
};

const classifyFileMetaRow = (doc, rule) => {
  const projectId = extractProjectId(doc);

  if (isFolderLikeRow(doc)) {
    return { included: false, reason: "folder metadata row", exclusionType: "folder", projectId };
  }

  const pathCandidates = pathCandidatesFor(doc);
  if (!pathCandidates.length) {
    return { included: false, reason: "missing path/fullPath/key child path", exclusionType: "missing_path", projectId };
  }

  for (const candidatePath of pathCandidates) {
    for (const variant of rule.folderVariants) {
      const childPath = childPathUnderVariant(candidatePath, variant);
      if (childPath && !childPath.endsWith("/")) {
        if (!projectId) {
          return {
            included: false,
            reason: "actual child file but missing project/order id",
            exclusionType: "missing_id",
            projectId,
            matchedPath: candidatePath,
            matchedFolderVariant: variant,
            childPath,
          };
        }

        return {
          included: true,
          reason: "actual child file",
          projectId,
          matchedPath: candidatePath,
          matchedFolderVariant: variant,
          childPath,
        };
      }
    }
  }

  const hasEqualFolderPath = pathCandidates.some((candidatePath) =>
    rule.folderVariants.some((variant) => normalizeComparable(candidatePath) === normalizeComparable(variant))
  );

  return {
    included: false,
    reason: hasEqualFolderPath ? "path equals selected folder" : "not under selected folder",
    exclusionType: hasEqualFolderPath ? "equal_path" : "outside_folder",
    projectId,
  };
};

const getRuleForFilter = (productionFilter) => {
  const key = PRODUCTION_FOLDER_FILTERS[productionFilter];
  return key ? FOLDER_RULES[key] : null;
};

const getCandidateRows = async (rule) =>
  FileMeta.find({
    $or: [
      { path: rule.candidateRegex },
      { fullPath: rule.candidateRegex },
      { key: rule.candidateRegex },
      { fileName: rule.candidateRegex },
      { name: rule.candidateRegex },
      { folderType: rule.candidateRegex },
    ],
  })
    .select(
      "_id path fullPath key fileName name isFolder contentType folderType metadata orderId projectId bookingId shoot_id stream_project_booking_id"
    )
    .lean();

const toDebugRow = (row, classification) => ({
  id: String(row._id),
  path: row.path || null,
  fullPath: row.fullPath || null,
  key: row.key || null,
  fileName: row.fileName || null,
  name: row.name || null,
  isFolder: Boolean(row.isFolder),
  contentType: row.contentType || null,
  folderType: row.folderType || null,
  extractedProjectId: classification.projectId ? String(classification.projectId) : null,
  included: classification.included,
  reason: classification.reason,
  matchedPath: classification.matchedPath || null,
  matchedFolderVariant: classification.matchedFolderVariant || null,
  childPath: classification.childPath || null,
});

const getProductionFolderMatches = async (productionFilter, options = {}) => {
  const includeRows = Boolean(options.includeRows);
  const rule = getRuleForFilter(productionFilter);
  if (!rule) {
    return {
      production_filter: productionFilter,
      matchedIds: [],
      summary: {
        production_filter: productionFilter,
        matchedCount: 0,
        evaluatedCount: 0,
        excludedFolderCount: 0,
        excludedEqualPathCount: 0,
      },
      ...(includeRows ? { matchedFileMeta: [], evaluatedFileMeta: [] } : {}),
    };
  }

  const rows = await getCandidateRows(rule);
  const matchedIdSet = new Set();
  let excludedFolderCount = 0;
  let excludedEqualPathCount = 0;
  const evaluatedFileMeta = [];
  const matchedFileMeta = [];

  rows.forEach((row) => {
    const classification = classifyFileMetaRow(row, rule);

    if (classification.exclusionType === "folder") excludedFolderCount += 1;
    if (classification.exclusionType === "equal_path") excludedEqualPathCount += 1;

    if (classification.included && classification.projectId) {
      matchedIdSet.add(String(classification.projectId));
    }

    if (includeRows) {
      const debugRow = toDebugRow(row, classification);
      evaluatedFileMeta.push(debugRow);
      if (debugRow.included) matchedFileMeta.push(debugRow);
    }
  });

  const matchedIds = Array.from(matchedIdSet);
  const summary = {
    production_filter: productionFilter,
    matchedCount: matchedIds.length,
    evaluatedCount: rows.length,
    excludedFolderCount,
    excludedEqualPathCount,
  };

  return {
    production_filter: productionFilter,
    matchedIds,
    summary,
    ...(includeRows ? { matchedFileMeta, evaluatedFileMeta } : {}),
  };
};

module.exports = {
  PRODUCTION_FOLDER_FILTERS,
  classifyFileMetaRow,
  getProductionFolderMatches,
};
