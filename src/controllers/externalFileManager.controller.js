const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { FileMeta, FaceEmbedding, Order, Booking } = require("../models");
const gcpFileService = require("../services/gcpFile.service");
const sendgridService = require("../services/sendgrid.service");
const {
  PRE_PRODUCTION_BRIEF_UPLOADED_TEMPLATE_ID,
  POST_PRODUCTION_UPLOAD_TEMPLATE_ID,
} = require("../config/sendgridTemplates");
const EXTERNAL_MEETINGS_BASE_URL =
  process.env.EXTERNAL_MEETINGS_API_BASE_URL ||
  process.env.MEETINGS_API_BASE_URL ||
  "";
const EXTERNAL_MEETINGS_KEY =
  process.env.EXTERNAL_MEETINGS_KEY ||
  process.env.INTERNAL_FILE_MANAGER_KEY ||
  "beige-internal-dev-key";

const FACE_SCAN_SERVICE_URL = process.env.FACE_SCAN_SERVICE_URL || "http://localhost:8000";
const FACE_SCAN_PROVIDER_TIMEOUT_MS = Math.max(
  15000,
  Number(process.env.FACE_SCAN_PROVIDER_TIMEOUT_MS || 3000000)
);
const FACE_SCAN_PROVIDER_TIMEOUT_MAX_MS = Math.max(
  FACE_SCAN_PROVIDER_TIMEOUT_MS,
  Number(process.env.FACE_SCAN_PROVIDER_TIMEOUT_MAX_MS || 3000000)
);
const FACE_SCAN_MAX_CANDIDATES = Math.max(25, Number(process.env.FACE_SCAN_MAX_CANDIDATES || 80));
const FACE_SCAN_FALLBACK_MAX_CANDIDATES = Math.max(
  50,
  Number(process.env.FACE_SCAN_FALLBACK_MAX_CANDIDATES || 120)
);
const FACE_SCAN_LIVE_CANDIDATE_LIMIT_MAX = Math.max(
  FACE_SCAN_MAX_CANDIDATES,
  Number(process.env.FACE_SCAN_LIVE_CANDIDATE_LIMIT_MAX || 100)
);
const FACE_SCAN_INDEX_CONCURRENCY = Math.max(1, Number(process.env.FACE_SCAN_INDEX_CONCURRENCY || 3));
const FACE_SCAN_REINDEX_CANDIDATE_LIMIT_MAX = Math.max(
  100,
  Number(process.env.FACE_SCAN_REINDEX_CANDIDATE_LIMIT_MAX || 1200)
);
const FACE_SCAN_MAX_INDEX_RETRIES = Math.max(
  1,
  Number(process.env.FACE_SCAN_MAX_INDEX_RETRIES || 2)
);
const FACE_SCAN_READY_COVERAGE_THRESHOLD = Math.max(
  0.5,
  Math.min(1, Number(process.env.FACE_SCAN_READY_COVERAGE_THRESHOLD || 0.9))
);
const FACE_SCAN_BACKGROUND_REINDEX_BATCH = Math.max(
  25,
  Number(process.env.FACE_SCAN_BACKGROUND_REINDEX_BATCH || 250)
);
const FACE_SCAN_BACKGROUND_REINDEX_CONCURRENCY = Math.max(
  1,
  Number(process.env.FACE_SCAN_BACKGROUND_REINDEX_CONCURRENCY || 2)
);
const ENABLE_UPLOAD_FACE_INDEXING =
  String(process.env.ENABLE_UPLOAD_FACE_INDEXING || "false").toLowerCase() === "true";
const FACE_SCAN_UPLOAD_INDEX_CONCURRENCY = Math.max(
  1,
  Number(process.env.FACE_SCAN_UPLOAD_INDEX_CONCURRENCY || 1)
);
const FACE_SCAN_UPLOAD_INDEX_QUEUE_LIMIT = Math.max(
  100,
  Number(process.env.FACE_SCAN_UPLOAD_INDEX_QUEUE_LIMIT || 5000)
);
const PARENT_FOLDER_CACHE_TTL_MS = Math.max(
  5000,
  Number(process.env.PARENT_FOLDER_CACHE_TTL_MS || 30000)
);
const parentFolderMetaCache = new Map();

const normalizeExternalId = (value) => String(value || "").trim();
const isRootWorkspacePath = (value) => !String(value || "").replace(/\/$/, "").includes("/");
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isImageLikePath = (value = "") =>
  /\.(jpg|jpeg|png|webp|heic|heif|bmp)$/i.test(String(value || "").toLowerCase());

const isImageLikeFile = (file = {}) => {
  const contentType = String(file.contentType || file.mimeType || "").toLowerCase();
  if (contentType.startsWith("image/")) return true;
  return isImageLikePath(file.path || file.name || "");
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

const resolveProviderTimeoutMs = (value, fallback = FACE_SCAN_PROVIDER_TIMEOUT_MS) => {
  const resolved = toPositiveInteger(value, fallback);
  return Math.max(15000, Math.min(resolved, FACE_SCAN_PROVIDER_TIMEOUT_MAX_MS));
};

const runWithConcurrency = async (items = [], concurrency = 3, task = async () => null) => {
  const workers = Math.max(1, Number(concurrency) || 1);
  let cursor = 0;

  const runner = async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      await task(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: Math.min(workers, Math.max(items.length, 1)) }, runner));
};

const cosineSimilarity = (vectorA = [], vectorB = []) => {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i += 1) {
    const a = Number(vectorA[i] || 0);
    const b = Number(vectorB[i] || 0);
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB) + 1e-8;
  const raw = dot / denominator;
  return Math.max(0, Math.min(1, (raw + 1) / 2));
};

const getBestFacePairScore = (queryEmbeddings = [], candidateEmbeddings = []) => {
  let bestScore = 0;
  let bestQueryIndex = -1;
  let bestCandidateIndex = -1;

  queryEmbeddings.forEach((queryEmbedding, queryIndex) => {
    candidateEmbeddings.forEach((candidateEmbedding, candidateIndex) => {
      const score = cosineSimilarity(queryEmbedding, candidateEmbedding);
      if (score > bestScore) {
        bestScore = score;
        bestQueryIndex = queryIndex;
        bestCandidateIndex = candidateIndex;
      }
    });
  });

  return {
    score: bestScore,
    queryFaceIndex: bestQueryIndex,
    candidateFaceIndex: bestCandidateIndex,
  };
};

const fetchFaceServicePayload = async (path, payload = {}, timeoutMs = FACE_SCAN_PROVIDER_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${FACE_SCAN_SERVICE_URL.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    const responsePayload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        responsePayload?.detail || responsePayload?.message || "Face scan provider request failed"
      );
      error.status = response.status;
      throw error;
    }

    return responsePayload;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Face scan provider timed out after ${timeoutMs}ms`);
      timeoutError.status = httpStatus.GATEWAY_TIMEOUT;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const isNoFaceDetectedError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("face could not be detected") ||
    message.includes("no face detected") ||
    message.includes("failed to process scan image")
  );
};

const encodePathForUrl = (value) =>
  String(value || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const toConsoleUrl = (path) => {
  const bucketName = process.env.GCP_BUCKET_NAME;
  if (!bucketName || !path) return null;
  const normalizedPath = String(path).replace(/^\/+|\/+$/g, "");
  return `https://console.cloud.google.com/storage/browser/${bucketName}/${encodePathForUrl(normalizedPath)}`;
};

const toWorkspaceSummary = (doc, fileCount = 0, updatedAt = null) => ({
  externalId: doc.metadata?.orderId || null,
  folderName: doc.name,
  rootPath: doc.path,
  fullPath: doc.fullPath,
  consoleUrl: toConsoleUrl(doc.path),
  fileCount,
  createdAt: doc.createdAt,
  updatedAt: updatedAt || doc.updatedAt,
});

const findWorkspaceRoot = async (externalId) =>
  FileMeta.findOne({
    isFolder: true,
    parentFolderId: null,
    path: { $regex: /^[^/]+\/?$/ },
    "metadata.orderId": normalizeExternalId(externalId),
  }).sort({ updatedAt: -1 });

const listWorkspaceContents = async (basePath) => {
  const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const docs = await FileMeta.find({
    path: { $regex: `^${escapeRegex(normalizedBasePath)}` },
  }).lean();

  const foldersMap = new Map();
  const files = [];

  docs.forEach((doc) => {
    if (doc.path === normalizedBasePath) return;

    const relativePath = doc.path.slice(normalizedBasePath.length).replace(/^\/+/, "");
    if (!relativePath) return;

    const segments = relativePath.split("/").filter(Boolean);
    if (!segments.length) return;

    if (doc.isFolder) {
      if (segments.length === 1) {
        foldersMap.set(doc.name, {
          name: doc.name,
          path: doc.path,
          fullPath: doc.fullPath,
          folderType: doc.folderType || null,
          fileCount: 0,
          updatedAt: doc.updatedAt,
          createdAt: doc.createdAt,
        });
      }
      return;
    }

    if (segments.length === 1) {
      files.push({
        id: doc._id.toString(),
        name: doc.name,
        path: doc.path,
        fullPath: doc.fullPath,
        size: doc.size || 0,
        contentType: doc.contentType || doc.mimeType || "",
        isPublic: doc.isPublic || false,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
      });
      return;
    }

    const directFolderName = segments[0];
    const existingFolder = foldersMap.get(directFolderName);
    if (existingFolder) {
      existingFolder.fileCount += 1;
      if (
        doc.updatedAt &&
        (!existingFolder.updatedAt || new Date(doc.updatedAt) > new Date(existingFolder.updatedAt))
      ) {
        existingFolder.updatedAt = doc.updatedAt;
      }
    } else {
      foldersMap.set(directFolderName, {
        name: directFolderName,
        path: `${normalizedBasePath}${directFolderName}/`,
        fullPath: `Website_Shoots_Flow/${normalizedBasePath}${directFolderName}/`,
        folderType: null,
        fileCount: 1,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
      });
    }
  });

  return {
    folders: Array.from(foldersMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    files: files.sort((a, b) => a.name.localeCompare(b.name)),
  };
};

const normalizeWorkspacePath = (value) => {
  let normalized = String(value || "").trim().replace(/^\/+/, "");
  if (normalized.startsWith("Website_Shoots_Flow/")) {
    normalized = normalized.replace(/^Website_Shoots_Flow\//, "");
  } else if (normalized.startsWith("shoots/")) {
    normalized = normalized.replace(/^shoots\//, "");
  }
  return normalized;
};

const toMongoUserIdOrNull = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return mongoose.Types.ObjectId.isValid(normalized) ? normalized : null;
};

const getParentFolderMetadata = async (cleanPath) => {
  const pathParts = cleanPath.split("/").filter(Boolean);
  if (pathParts.length <= 1) {
    return { parentFolder: null };
  }

  const folderPath = `${pathParts.slice(0, -1).join("/")}/`;
  const cacheKey = folderPath.toLowerCase();
  const now = Date.now();
  const cached = parentFolderMetaCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { parentFolder: cached.parentFolder };
  }

  const parentFolder = await FileMeta.findOne({
    path: folderPath,
    isFolder: true,
  })
    .select("_id path userId metadata")
    .lean();

  parentFolderMetaCache.set(cacheKey, {
    parentFolder: parentFolder || null,
    expiresAt: now + PARENT_FOLDER_CACHE_TTL_MS,
  });

  return { parentFolder };
};

const resolveWorkspaceBasePath = (workspacePath, phase, subPath) => {
  let basePath = workspacePath;

  if (phase === "pre") {
    basePath = `${workspacePath.replace(/\/$/, "")}/Pre-Production/`;
  } else if (phase === "post") {
    basePath = `${workspacePath.replace(/\/$/, "")}/Post-Production/`;
  }

  if (subPath) {
    basePath = `${basePath.replace(/\/$/, "")}/${subPath.replace(/^\/+|\/+$/g, "")}/`;
  }

  return basePath;
};

const getAncestorFolderPaths = (fileOrFolderPath) => {
  const normalized = normalizeWorkspacePath(fileOrFolderPath).replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return [];

  const folderPaths = [];
  for (let index = 0; index < parts.length - 1; index += 1) {
    folderPaths.push(`${parts.slice(0, index + 1).join("/")}/`);
  }

  return folderPaths;
};

const touchFolderHierarchy = async (fileOrFolderPath, touchedAt = new Date()) => {
  const folderPaths = getAncestorFolderPaths(fileOrFolderPath);
  if (!folderPaths.length) return;

  await FileMeta.updateMany(
    {
      isFolder: true,
      path: { $in: folderPaths },
    },
    {
      $set: { updatedAt: touchedAt },
    }
  );
};

const getWorkspaceActivityAt = async (rootPath, fallbackDate) => {
  const latestEntry = await FileMeta.findOne({
    path: { $regex: `^${escapeRegex(rootPath)}` },
  })
    .sort({ updatedAt: -1 })
    .lean();

  return latestEntry?.updatedAt || fallbackDate;
};

const getWorkspaceFileCount = async (rootPath) =>
  FileMeta.countDocuments({
    isFolder: false,
    path: { $regex: `^${escapeRegex(rootPath)}` },
  });

const listWorkspaceImageCandidates = async (externalId) => {
  const workspace = await findWorkspaceRoot(externalId);
  if (!workspace) return [];

  const docs = await FileMeta.find({
    isFolder: false,
    path: { $regex: `^${escapeRegex(workspace.path)}` },
  })
    .select("path name contentType mimeType updatedAt createdAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  return docs
    .filter(isImageLikeFile)
    .map((doc) => ({
      path: doc.path,
      name: doc.name,
      contentType: doc.contentType || doc.mimeType || "",
      updatedAt: doc.updatedAt || doc.createdAt || null,
    }));
};

const getFileSignedViewUrl = async (filepath) => {
  const normalized = normalizeWorkspacePath(filepath);
  if (!normalized) return "";
  const downloadPayload = await gcpFileService.downloadFiles(
    normalized.startsWith("Website_Shoots_Flow/") ? normalized : `Website_Shoots_Flow/${normalized}`,
    false
  );
  return String(downloadPayload?.url || "");
};

const extractEmbeddingsFromPayload = (payload) => {
  const embeddings = payload?.data?.embeddings || payload?.embeddings || [];
  return Array.isArray(embeddings) ? embeddings : [];
};

const fetchEmbeddingsForImage = async ({ scanImageBase64, scanImageUrl, providerTimeoutMs }) => {
  const payload = await fetchFaceServicePayload(
    "/embed",
    {
      scanImageBase64: scanImageBase64 || undefined,
      scanImageUrl: scanImageUrl || undefined,
    },
    providerTimeoutMs
  );
  return extractEmbeddingsFromPayload(payload);
};

const upsertFaceEmbedding = async ({
  externalId,
  filepath,
  fileName = "",
  contentType = "",
  embeddings = [],
  status = "ready",
  errorMessage = null,
  errorCode = null,
  retryCount = 0,
}) => {
  const normalizedExternalId = normalizeExternalId(externalId);
  const normalizedPath = normalizeWorkspacePath(filepath);
  if (!normalizedExternalId || !normalizedPath) return null;

  return FaceEmbedding.findOneAndUpdate(
    { filepath: normalizedPath },
    {
      $set: {
        externalId: normalizedExternalId,
        filepath: normalizedPath,
        fileName: String(fileName || ""),
        contentType: String(contentType || ""),
        embeddings: Array.isArray(embeddings) ? embeddings : [],
        facesCount: Array.isArray(embeddings) ? embeddings.length : 0,
        status,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 255) : null,
        errorCode: errorCode ? String(errorCode).slice(0, 64) : null,
        retryCount: Math.max(0, Number(retryCount || 0)),
        indexedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const indexEmbeddingForCandidate = async ({
  externalId,
  filepath,
  fileName = "",
  contentType = "",
  providerTimeoutMs = FACE_SCAN_PROVIDER_TIMEOUT_MS,
}) => {
  const normalizedPath = normalizeWorkspacePath(filepath);
  const looksLikeImage =
    String(contentType || "").toLowerCase().startsWith("image/") ||
    isImageLikePath(fileName) ||
    isImageLikePath(normalizedPath);

  if (!normalizeExternalId(externalId) || !normalizedPath || !looksLikeImage) {
    return { status: "skipped", reason: "not_image_or_invalid" };
  }

  let existingRetryCount = 0;
  try {
    const existing = await FaceEmbedding.findOne({ filepath: normalizedPath })
      .select("status retryCount")
      .lean();
    const existingStatus = String(existing?.status || "");
    existingRetryCount = Math.max(0, Number(existing?.retryCount || 0));

    if (existingStatus === "skipped") {
      return { status: "skipped", reason: "final_skipped" };
    }

    if (!existing || existingStatus !== "ready") {
      await upsertFaceEmbedding({
        externalId,
        filepath: normalizedPath,
        fileName,
        contentType,
        status: "indexing",
        errorMessage: null,
        errorCode: null,
        retryCount: existingRetryCount,
      });
    }

    const scanImageUrl = await getFileSignedViewUrl(normalizedPath);
    if (!scanImageUrl) {
      const nextRetryCount = existingRetryCount + 1;
      const status = nextRetryCount >= FACE_SCAN_MAX_INDEX_RETRIES ? "skipped" : "failed";
      await upsertFaceEmbedding({
        externalId,
        filepath: normalizedPath,
        fileName,
        contentType,
        embeddings: [],
        status,
        errorMessage: "Missing file view URL",
        errorCode: "missing_view_url",
        retryCount: nextRetryCount,
      });
      return { status, reason: "missing_view_url" };
    }

    const embeddings = await fetchEmbeddingsForImage({ scanImageUrl, providerTimeoutMs });
    if (!embeddings.length) {
      await upsertFaceEmbedding({
        externalId,
        filepath: normalizedPath,
        fileName,
        contentType,
        embeddings: [],
        status: "skipped",
        errorMessage: "No face detected",
        errorCode: "no_face",
        retryCount: existingRetryCount,
      });
      return { status: "skipped", reason: "no_face" };
    }

    await upsertFaceEmbedding({
      externalId,
      filepath: normalizedPath,
      fileName,
      contentType,
      embeddings,
      status: "ready",
      errorMessage: null,
      errorCode: null,
      retryCount: 0,
    });

    return { status: "indexed", facesCount: embeddings.length };
  } catch (error) {
    const nextRetryCount = existingRetryCount + 1;
    const shouldFinalize = nextRetryCount >= FACE_SCAN_MAX_INDEX_RETRIES;
    const status = shouldFinalize ? "skipped" : "failed";

    await upsertFaceEmbedding({
      externalId,
      filepath: normalizedPath,
      fileName,
      contentType,
      embeddings: [],
      status,
      errorMessage: error?.message || "Face indexing failed",
      errorCode: Number(error?.status || 0) === 400 ? "provider_bad_request" : "provider_error",
      retryCount: nextRetryCount,
    });
    return { status, reason: error?.message || "Face indexing failed" };
  }
};

const resolveUploadTemplateIdByPath = (cleanPath = "") => {
  const normalizedPath = String(cleanPath || "").toLowerCase();
  if (normalizedPath.includes("/pre-production/")) {
    return PRE_PRODUCTION_BRIEF_UPLOADED_TEMPLATE_ID;
  }
  if (normalizedPath.includes("/post-production/")) {
    return POST_PRODUCTION_UPLOAD_TEMPLATE_ID;
  }
  return null;
};

const resolveOrderByReference = async (orderRef) => {
  const normalizedRef = normalizeExternalId(orderRef);
  if (!normalizedRef) return null;

  const filters = [];
  if (mongoose.Types.ObjectId.isValid(normalizedRef)) {
    filters.push({ _id: normalizedRef });
  }
  filters.push({ shoot_id: normalizedRef });
  filters.push({ order_name: { $regex: `${escapeRegex(normalizedRef)}$`, $options: "i" } });

  return Order.findOne(filters.length === 1 ? filters[0] : { $or: filters })
    .populate("client_id", "name email")
    .lean();
};

const resolveOrderRecipientEmail = async (orderDoc) => {
  if (!orderDoc) return "";

  const primary = normalizeEmail(orderDoc?.client_id?.email || orderDoc?.guest_info?.email || "");
  if (primary) return primary;

  const booking = await Booking.findOne({ orderId: orderDoc._id })
    .sort({ createdAt: -1 })
    .select("guestEmail")
    .lean();
  return normalizeEmail(booking?.guestEmail || "");
};

const fetchExternalMeetingRecipient = async (orderRef) => {
  try {
    const normalizedRef = normalizeExternalId(orderRef);
    if (!EXTERNAL_MEETINGS_BASE_URL || !normalizedRef) return null;

    const query = new URLSearchParams({ page: "1", limit: "20" }).toString();
    const response = await fetch(
      `${EXTERNAL_MEETINGS_BASE_URL.replace(/\/+$/, "")}/order/${encodeURIComponent(normalizedRef)}?${query}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": EXTERNAL_MEETINGS_KEY,
        },
      }
    );

    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const meetings = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data?.results)
        ? payload.data.results
        : Array.isArray(payload)
          ? payload
          : [];

    if (!meetings.length) return null;

    const users = [];
    meetings.forEach((meeting) => {
      if (meeting?.client?.email) {
        users.push({
          email: meeting.client.email,
          name: meeting.client.name || "Client",
          role: "client",
        });
      }
      if (meeting?.admin?.email) {
        users.push({
          email: meeting.admin.email,
          name: meeting.admin.name || "Admin",
          role: "admin",
        });
      }
      (Array.isArray(meeting?.participants) ? meeting.participants : []).forEach((p) => {
        if (p?.email) {
          users.push({
            email: p.email,
            name: p.name || "Participant",
            role: p.role || "participant",
          });
        }
      });
      (Array.isArray(meeting?.cps) ? meeting.cps : []).forEach((cp) => {
        if (cp?.email) {
          users.push({
            email: cp.email,
            name: cp.name || "Creative Partner",
            role: cp.role || "cp",
          });
        }
      });
    });

    const normalized = users
      .map((entry) => ({
        ...entry,
        email: normalizeEmail(entry.email),
      }))
      .filter((entry) => !!entry.email);

    if (!normalized.length) return null;
    const clientCandidate = normalized.find((entry) => entry.role === "client");
    return clientCandidate || normalized[0];
  } catch (error) {
    console.warn("[file-manager] external meetings recipient lookup failed:", error?.message || error);
    return null;
  }
};

const sendFileUploadTemplateEmail = async ({
  orderId,
  cleanPath,
  fileName,
  uploadedByName,
  uploadedById,
}) => {
  try {
    const templateId = resolveUploadTemplateIdByPath(cleanPath);
    if (!templateId || !orderId) {
      return;
    }

    const order = await resolveOrderByReference(orderId);
    let recipientEmail = order ? await resolveOrderRecipientEmail(order) : "";
    let recipientName = order
      ? String(order?.client_id?.name || order?.guest_info?.name || "Client").trim()
      : "Client";

    if (!recipientEmail) {
      const externalRecipient = await fetchExternalMeetingRecipient(orderId);
      if (externalRecipient?.email) {
        recipientEmail = normalizeEmail(externalRecipient.email);
        recipientName = String(externalRecipient.name || recipientName || "Client").trim();
      }
    }

    if (!recipientEmail) {
      console.warn("[file-manager] recipient email not found for upload email", {
        orderId: String(order?._id || ""),
        orderRef: String(orderId),
      });
      return;
    }

    const uploadPhase = String(cleanPath || "").toLowerCase().includes("/pre-production/")
      ? "pre_production"
      : "post_production";

    await sendgridService.sendDynamicTemplateEmail({
      to: recipientEmail,
      templateId,
      dynamicTemplateData: {
        recipient_name: recipientName,
        order_id: String(order?._id || orderId || ""),
        order_name: String(order?.order_name || `Project #${orderId}`),
        file_name: String(fileName || cleanPath.split("/").pop() || ""),
        file_path: String(cleanPath || ""),
        upload_phase: uploadPhase,
        uploaded_by_name: String(uploadedByName || "Beige User"),
        uploaded_by_id: String(uploadedById || ""),
        uploaded_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn("[file-manager] upload template email failed:", error?.message || error);
  }
};

const uploadFaceIndexQueue = [];
let uploadFaceIndexActiveCount = 0;

const processUploadFaceIndexQueue = () => {
  if (!ENABLE_UPLOAD_FACE_INDEXING) return;

  while (
    uploadFaceIndexActiveCount < FACE_SCAN_UPLOAD_INDEX_CONCURRENCY &&
    uploadFaceIndexQueue.length > 0
  ) {
    const job = uploadFaceIndexQueue.shift();
    if (!job) break;
    uploadFaceIndexActiveCount += 1;

    void indexEmbeddingForCandidate(job)
      .catch((error) => {
        console.warn("[face-index] upload-index-queue-failed", {
          externalId: job?.externalId,
          filepath: job?.filepath,
          reason: error?.message || "unknown",
        });
      })
      .finally(() => {
        uploadFaceIndexActiveCount = Math.max(0, uploadFaceIndexActiveCount - 1);
        setImmediate(processUploadFaceIndexQueue);
      });
  }
};

const enqueueUploadFaceIndexJob = (job) => {
  if (!ENABLE_UPLOAD_FACE_INDEXING) return;
  if (!job?.externalId || !job?.filepath) return;

  if (uploadFaceIndexQueue.length >= FACE_SCAN_UPLOAD_INDEX_QUEUE_LIMIT) {
    console.warn("[face-index] upload-index-queue-overflow", {
      queueLength: uploadFaceIndexQueue.length,
      limit: FACE_SCAN_UPLOAD_INDEX_QUEUE_LIMIT,
      externalId: job.externalId,
      filepath: job.filepath,
    });
    return;
  }

  uploadFaceIndexQueue.push(job);
  processUploadFaceIndexQueue();
};

const scheduleBackgroundReindex = ({
  externalId,
  candidates = [],
  candidateLimit = FACE_SCAN_BACKGROUND_REINDEX_BATCH,
  concurrency = FACE_SCAN_BACKGROUND_REINDEX_CONCURRENCY,
  providerTimeoutMs = FACE_SCAN_PROVIDER_TIMEOUT_MS,
}) => {
  const selected = (Array.isArray(candidates) ? candidates : []).slice(
    0,
    toPositiveInteger(candidateLimit, FACE_SCAN_BACKGROUND_REINDEX_BATCH)
  );
  if (!selected.length) return 0;

  void runWithConcurrency(selected, concurrency, async (candidate) => {
    await indexEmbeddingForCandidate({
      externalId,
      filepath: candidate.path,
      fileName: candidate.name,
      contentType: candidate.contentType,
      providerTimeoutMs,
    });
  }).catch((error) => {
    console.warn("[face-index] background-reindex-failed", {
      externalId,
      reason: error?.message || "unknown",
    });
  });

  return selected.length;
};

const getWorkspaceFaceIndexSummary = async (externalId, candidates = null) => {
  const normalizedExternalId = normalizeExternalId(externalId);
  if (!normalizedExternalId) {
    return {
      state: "not_indexed",
      totalCandidates: 0,
      readyCandidates: 0,
      skippedCandidates: 0,
      indexingCandidates: 0,
      failedCandidates: 0,
      pendingCandidates: 0,
      coverage: 0,
    };
  }

  const workspaceCandidates = Array.isArray(candidates)
    ? candidates
    : await listWorkspaceImageCandidates(normalizedExternalId);
  const candidatePathSet = new Set(
    workspaceCandidates
      .map((candidate) => normalizeWorkspacePath(candidate?.path))
      .filter(Boolean)
  );

  const rows = await FaceEmbedding.find({
    externalId: normalizedExternalId,
    filepath: { $in: Array.from(candidatePathSet) },
  })
    .select("filepath status retryCount")
    .lean();

  let readyCandidates = 0;
  let skippedCandidates = 0;
  let failedCandidates = 0;
  let indexingCandidates = 0;

  rows.forEach((row) => {
    const status = String(row?.status || "");
    const retryCount = Math.max(0, Number(row?.retryCount || 0));
    if (status === "ready") readyCandidates += 1;
    else if (status === "skipped") skippedCandidates += 1;
    else if (status === "failed" && retryCount >= FACE_SCAN_MAX_INDEX_RETRIES) skippedCandidates += 1;
    else if (status === "failed") failedCandidates += 1;
    else if (status === "indexing") indexingCandidates += 1;
  });

  const totalCandidates = candidatePathSet.size;
  const pendingCandidates = Math.max(
    0,
    totalCandidates - readyCandidates - indexingCandidates - skippedCandidates - failedCandidates
  );
  const effectiveReadyCandidates = readyCandidates + skippedCandidates;
  const coverage = totalCandidates
    ? Number((effectiveReadyCandidates / totalCandidates).toFixed(4))
    : 0;

  let state = "not_indexed";
  if (!totalCandidates) state = "empty";
  else if (coverage >= FACE_SCAN_READY_COVERAGE_THRESHOLD) state = "ready";
  else if (indexingCandidates > 0) state = "indexing";
  else if (effectiveReadyCandidates > 0 || failedCandidates > 0) state = "partial";

  return {
    state,
    totalCandidates,
    readyCandidates,
    skippedCandidates,
    indexingCandidates,
    failedCandidates,
    pendingCandidates,
    coverage,
  };
};

const mergeFaceMatchesByBestScore = (matches = []) => {
  const mergedMap = new Map();

  matches.forEach((item) => {
    const path = String(item?.path || "").trim();
    if (!path) return;
    const existing = mergedMap.get(path);
    if (!existing || Number(item.score || 0) > Number(existing.score || 0)) {
      mergedMap.set(path, item);
    }
  });

  return Array.from(mergedMap.values()).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
};

const runProviderFaceSearch = async ({
  externalId,
  scanImageBase64,
  scanImageUrl,
  threshold,
  maxResults,
  providerTimeoutMs,
  candidates = [],
}) => {
  if (!Array.isArray(candidates) || !candidates.length) {
    return {
      scannedCandidatesCount: 0,
      matches: [],
      provider: "deepface",
    };
  }

  const candidatesWithUrls = (
    await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const url = await getFileSignedViewUrl(candidate.path);
          if (!url) return null;
          return {
            path: candidate.path,
            url,
            name: candidate.name,
          };
        } catch (error) {
          return null;
        }
      })
    )
  ).filter(Boolean);

  if (!candidatesWithUrls.length) {
    return {
      scannedCandidatesCount: 0,
      matches: [],
      provider: "deepface",
    };
  }

  const providerPayload = await fetchFaceServicePayload(
    "/search",
    {
      externalId,
      scanMode: "full_face_scan",
      scanImageBase64: scanImageBase64 || undefined,
      scanImageUrl: scanImageUrl || undefined,
      candidates: candidatesWithUrls,
      threshold,
      maxResults,
    },
    providerTimeoutMs
  );

  return {
    scannedCandidatesCount: candidatesWithUrls.length,
    matches: providerPayload?.data?.matches || providerPayload?.matches || [],
    provider: providerPayload?.data?.provider || providerPayload?.provider || "deepface",
  };
};

const buildFolderDownloadUrl = (req, cleanPath) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/v1/gcp/download-folder?folderpath=${encodeURIComponent(cleanPath)}`;
};

exports.createWorkspace = async (req, res, next) => {
  try {
    const externalId = normalizeExternalId(req.body.externalId);
    const folderName = String(req.body.folderName || "").trim();

    if (!externalId || !folderName) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "externalId and folderName are required",
      });
    }

    let workspace = await findWorkspaceRoot(externalId);
    if (!workspace) {
      await gcpFileService.createFolder(folderName, null, externalId, null);
      workspace = await findWorkspaceRoot(externalId);
    }

    if (!workspace) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Workspace could not be created",
      });
    }

    const contents = await listWorkspaceContents(workspace.path);
    const activityAt = await getWorkspaceActivityAt(workspace.path, workspace.updatedAt);
    const fileCount = await getWorkspaceFileCount(workspace.path);

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        workspace: toWorkspaceSummary(workspace, fileCount, activityAt),
        folders: contents.folders,
        files: contents.files,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.listWorkspaces = async (req, res, next) => {
  try {
    const roots = await FileMeta.find({
      isFolder: true,
      parentFolderId: null,
      path: { $regex: /^[^/]+\/?$/ },
      "metadata.orderId": { $exists: true, $ne: null },
    })
      .sort({ updatedAt: -1 })
      .lean();

    const workspaces = await Promise.all(
      roots
      .filter((root) => isRootWorkspacePath(root.path))
      .map(async (root) => {
        const fileCount = await getWorkspaceFileCount(root.path);
        const activityAt = await getWorkspaceActivityAt(root.path, root.updatedAt);
        return toWorkspaceSummary(root, fileCount, activityAt);
      })
    );

    return res.status(httpStatus.OK).json({
      success: true,
      data: { workspaces },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getWorkspace = async (req, res, next) => {
  try {
    const externalId = normalizeExternalId(req.params.externalId);
    const workspace = await findWorkspaceRoot(externalId);

    if (!workspace) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Workspace not found",
      });
    }

    const contents = await listWorkspaceContents(workspace.path);
    const activityAt = await getWorkspaceActivityAt(workspace.path, workspace.updatedAt);
    const fileCount = await getWorkspaceFileCount(workspace.path);

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        workspace: toWorkspaceSummary(workspace, fileCount, activityAt),
        folders: contents.folders,
        files: contents.files,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getWorkspaceFiles = async (req, res, next) => {
  try {
    const externalId = normalizeExternalId(req.params.externalId);
    const phase = String(req.query.phase || "root").trim().toLowerCase();
    const subPath = String(req.query.path || "").trim();
    const workspace = await findWorkspaceRoot(externalId);

    if (!workspace) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Workspace not found",
      });
    }

    const basePath = resolveWorkspaceBasePath(workspace.path, phase, subPath);

    const contents = await listWorkspaceContents(basePath);
    const activityAt = await getWorkspaceActivityAt(workspace.path, workspace.updatedAt);
    const fileCount = await getWorkspaceFileCount(workspace.path);

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        workspace: toWorkspaceSummary(workspace, fileCount, activityAt),
        phase,
        path: subPath,
        basePath,
        folders: contents.folders,
        files: contents.files,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.createFolder = async (req, res, next) => {
  try {
    const externalId = normalizeExternalId(req.body.externalId);
    const phase = String(req.body.phase || "root").trim().toLowerCase();
    const subPath = String(req.body.path || "").trim();
    const folderName = String(req.body.folderName || req.body.name || "").trim();

    if (!externalId || !folderName) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "externalId and folderName are required",
      });
    }

    if (!["pre", "post"].includes(phase)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Folders can only be created inside Pre Production or Post Production",
      });
    }

    const workspace = await findWorkspaceRoot(externalId);
    if (!workspace) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Workspace not found",
      });
    }

    const basePath = resolveWorkspaceBasePath(workspace.path, phase, subPath);
    const cleanBasePath = normalizeWorkspacePath(basePath).replace(/\/$/, "");
    const cleanFolderName = folderName.replace(/^\/+|\/+$/g, "");
    const folderPath = `${cleanBasePath}/${cleanFolderName}`;
    const { parentFolder } = await getParentFolderMetadata(folderPath);

    if (!parentFolder) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Parent folder not found",
      });
    }

    const result = await gcpFileService.createFolder(
      folderPath,
      parentFolder.metadata?.cpIds || [],
      parentFolder.metadata?.orderId || null,
      parentFolder.userId || null
    );

    const createdFolderPath = `${folderPath.replace(/\/+$/, "")}/`;
    const createdFolderDoc = await FileMeta.findOne({
      path: createdFolderPath,
      isFolder: true,
    }).sort({ updatedAt: -1 });

    if (createdFolderDoc) {
      const shouldSave =
        String(createdFolderDoc.parentFolderId || "") !== String(parentFolder._id || "") ||
        createdFolderDoc.metadata?.orderId !== (parentFolder.metadata?.orderId || null);

      if (shouldSave) {
        createdFolderDoc.parentFolderId = parentFolder._id;
        createdFolderDoc.metadata = {
          ...(createdFolderDoc.metadata || {}),
          orderId: parentFolder.metadata?.orderId || null,
          cpIds: parentFolder.metadata?.cpIds || [],
        };
        await createdFolderDoc.save();
      }
    }

    await touchFolderHierarchy(createdFolderPath);

    if (result?.error) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: result.error === "file-exists" ? "Folder already exists" : "Failed to create folder",
        error: result.error,
      });
    }

    return res.status(result?.alreadyExists ? httpStatus.OK : httpStatus.CREATED).json({
      success: true,
      message: result?.alreadyExists ? "Folder already exists" : "Folder created successfully",
      data: {
        folder: result?.folder || null,
        alreadyExists: !!result?.alreadyExists,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const resolveUploadPolicyForFile = async ({ filepath, fileContentType, fileSize, userId }) => {
  const cleanPath = normalizeWorkspacePath(filepath);
  const cleanContentType = String(fileContentType || "").trim();
  const normalizedFileSize = Number(fileSize || 0);
  const normalizedUserId = userId ? String(userId).trim() : null;

  if (!cleanPath || !cleanContentType || !normalizedFileSize) {
    return {
      ok: false,
      code: httpStatus.BAD_REQUEST,
      error: "filepath, fileContentType and fileSize are required",
      filepath: cleanPath || String(filepath || ""),
    };
  }

  const { parentFolder } = await getParentFolderMetadata(cleanPath);
  if (!parentFolder) {
    return {
      ok: false,
      code: httpStatus.NOT_FOUND,
      error: "Parent folder not found",
      filepath: cleanPath,
    };
  }

  const result = await gcpFileService.uploadFile(
    `Website_Shoots_Flow/${cleanPath}`.replace(/\/+/g, "/"),
    cleanContentType,
    normalizedFileSize,
    normalizedUserId,
    {
      orderId: parentFolder.metadata?.orderId || null,
    }
  );

  return {
    ok: true,
    filepath: cleanPath,
    data: result,
  };
};

const completeUploadMetadataForFile = async ({
  filepath,
  fileContentType,
  fileSize,
  fileName,
  userId,
  authorName,
  providerTimeoutMs,
}) => {
  const cleanPath = normalizeWorkspacePath(filepath);
  const cleanContentType = String(fileContentType || "application/octet-stream").trim();
  const normalizedFileSize = Number(fileSize || 0);
  const cleanFileName = String(fileName || cleanPath.split("/").pop() || "").trim();
  const normalizedUserId = userId ? String(userId).trim() : null;
  const cleanAuthorName = String(authorName || "Beige User").trim();
  const mongoUserId = toMongoUserIdOrNull(normalizedUserId);

  if (!cleanPath || !normalizedUserId) {
    return {
      ok: false,
      code: httpStatus.BAD_REQUEST,
      error: "filepath and userId are required",
      filepath: cleanPath || String(filepath || ""),
    };
  }

  const { parentFolder } = await getParentFolderMetadata(cleanPath);
  const folderMetadata = {
    cpIds: parentFolder?.metadata?.cpIds || [],
    orderId: parentFolder?.metadata?.orderId || null,
    externalUserId: normalizedUserId,
  };

  const touchedAt = new Date();
  const existingFile = await FileMeta.findOne({ path: cleanPath });

  if (existingFile) {
    existingFile.size = normalizedFileSize;
    existingFile.contentType = cleanContentType;
    existingFile.updatedAt = touchedAt;
    existingFile.metadata = {
      ...existingFile.metadata,
      cpIds: folderMetadata.cpIds,
      orderId: folderMetadata.orderId,
    };
    if (!existingFile.author || existingFile.author === "Unknown") {
      existingFile.author = cleanAuthorName;
    }
    await existingFile.save();
    await touchFolderHierarchy(cleanPath, touchedAt);

    enqueueUploadFaceIndexJob({
      externalId: folderMetadata.orderId,
      filepath: cleanPath,
      fileName: cleanFileName,
      contentType: cleanContentType,
      providerTimeoutMs: resolveProviderTimeoutMs(providerTimeoutMs),
    });

    await sendFileUploadTemplateEmail({
      orderId: folderMetadata.orderId,
      cleanPath,
      fileName: existingFile.name || cleanFileName,
      uploadedByName: cleanAuthorName,
      uploadedById: normalizedUserId,
    });

    return {
      ok: true,
      created: false,
      data: {
        id: existingFile._id.toString(),
        path: existingFile.path,
        name: existingFile.name,
        size: existingFile.size,
      },
    };
  }

  const fileDoc = await FileMeta.create({
    path: cleanPath,
    name: cleanFileName,
    userId: mongoUserId,
    isFolder: false,
    contentType: cleanContentType,
    size: normalizedFileSize,
    isPublic: false,
    author: cleanAuthorName,
    fullPath: `Website_Shoots_Flow/${cleanPath}`,
    metadata: {
      cpIds: folderMetadata.cpIds,
      orderId: folderMetadata.orderId,
    },
    createdAt: touchedAt,
    updatedAt: touchedAt,
  });

  await touchFolderHierarchy(cleanPath, touchedAt);

  enqueueUploadFaceIndexJob({
    externalId: folderMetadata.orderId,
    filepath: cleanPath,
    fileName: cleanFileName,
    contentType: cleanContentType,
    providerTimeoutMs: resolveProviderTimeoutMs(providerTimeoutMs),
  });

  await sendFileUploadTemplateEmail({
    orderId: folderMetadata.orderId,
    cleanPath,
    fileName: fileDoc.name || cleanFileName,
    uploadedByName: cleanAuthorName,
    uploadedById: normalizedUserId,
  });

  return {
    ok: true,
    created: true,
    data: {
      id: fileDoc._id.toString(),
      path: fileDoc.path,
      name: fileDoc.name,
      size: fileDoc.size,
    },
  };
};

exports.getUploadPolicy = async (req, res, next) => {
  try {
    const result = await resolveUploadPolicyForFile({
      filepath: req.body.filepath,
      fileContentType: req.body.fileContentType,
      fileSize: req.body.fileSize,
      userId: req.body.userId,
    });

    if (!result.ok) {
      return res.status(result.code).json({
        success: false,
        message: result.error,
      });
    }

    return res.status(httpStatus.OK).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getUploadPoliciesBatch = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "items array is required",
      });
    }

    const limitedItems = items.slice(0, 500);
    const results = [];

    await runWithConcurrency(limitedItems, 5, async (item = {}) => {
      try {
        const resolved = await resolveUploadPolicyForFile({
          filepath: item.filepath,
          fileContentType: item.fileContentType,
          fileSize: item.fileSize,
          userId: item.userId || req.body.userId,
        });

        if (resolved.ok) {
          results.push({
            filepath: resolved.filepath,
            success: true,
            data: resolved.data,
          });
        } else {
          results.push({
            filepath: resolved.filepath || String(item.filepath || ""),
            success: false,
            error: resolved.error,
            code: resolved.code,
          });
        }
      } catch (error) {
        results.push({
          filepath: String(item.filepath || ""),
          success: false,
          error: error?.message || "Failed to create upload policy",
          code: httpStatus.INTERNAL_SERVER_ERROR,
        });
      }
    });

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        total: limitedItems.length,
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
        items: results,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.completeUpload = async (req, res, next) => {
  try {
    const result = await completeUploadMetadataForFile({
      filepath: req.body.filepath,
      fileContentType: req.body.fileContentType,
      fileSize: req.body.fileSize,
      fileName: req.body.fileName,
      userId: req.body.userId,
      authorName: req.body.authorName,
      providerTimeoutMs: req.body.providerTimeoutMs,
    });

    if (!result.ok) {
      return res.status(result.code).json({
        success: false,
        message: result.error,
      });
    }

    return res.status(result.created ? httpStatus.CREATED : httpStatus.OK).json({
      success: true,
      message: result.created ? "File metadata created" : "File metadata updated",
      data: result.data,
    });
  } catch (error) {
    return next(error);
  }
};

exports.completeUploadsBatch = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "items array is required",
      });
    }

    const limitedItems = items.slice(0, 500);
    const results = [];

    await runWithConcurrency(limitedItems, 5, async (item = {}) => {
      try {
        const completed = await completeUploadMetadataForFile({
          filepath: item.filepath,
          fileContentType: item.fileContentType,
          fileSize: item.fileSize,
          fileName: item.fileName,
          userId: item.userId || req.body.userId,
          authorName: item.authorName || req.body.authorName,
          providerTimeoutMs: item.providerTimeoutMs || req.body.providerTimeoutMs,
        });

        if (completed.ok) {
          results.push({
            filepath: String(item.filepath || ""),
            success: true,
            created: !!completed.created,
            data: completed.data,
          });
        } else {
          results.push({
            filepath: String(item.filepath || ""),
            success: false,
            error: completed.error,
            code: completed.code,
          });
        }
      } catch (error) {
        results.push({
          filepath: String(item.filepath || ""),
          success: false,
          error: error?.message || "Failed to complete upload metadata",
          code: httpStatus.INTERNAL_SERVER_ERROR,
        });
      }
    });

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        total: limitedItems.length,
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
        items: results,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.searchFaceMatches = async (req, res, next) => {
  try {
    const externalId = normalizeExternalId(req.body.externalId || req.body.eventExternalId);
    const scanImageBase64 = String(req.body.scanImageBase64 || "").trim();
    const scanImageUrl = String(req.body.scanImageUrl || "").trim();
    const threshold = Math.max(0, Math.min(1, Number(req.body.threshold || 0.7)));
    const maxResults = toPositiveInteger(req.body.maxResults, 200);
    const minScore = Math.max(0, Math.min(1, Number(req.body.minScore ?? threshold)));
    const providerTimeoutMs = resolveProviderTimeoutMs(req.body.providerTimeoutMs);

    if (!externalId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "externalId is required",
      });
    }

    if (!scanImageBase64 && !scanImageUrl) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "scanImageBase64 or scanImageUrl is required",
      });
    }

    const allCandidates = await listWorkspaceImageCandidates(externalId);
    const candidatePathSet = new Set(
      allCandidates.map((candidate) => normalizeWorkspacePath(candidate?.path)).filter(Boolean)
    );
    const indexedRows = await FaceEmbedding.find({
      externalId,
      status: "ready",
    })
      .select("filepath fileName embeddings facesCount")
      .sort({ updatedAt: -1 })
      .lean();
    const indexedRowsInWorkspace = indexedRows.filter((row) =>
      candidatePathSet.has(normalizeWorkspacePath(row?.filepath))
    );

    const indexedMatches = [];
    const indexedPathSet = new Set(
      indexedRowsInWorkspace.map((row) => String(row.filepath || "").trim()).filter(Boolean)
    );
    const nonReadyRows = await FaceEmbedding.find({
      externalId,
      filepath: { $in: Array.from(candidatePathSet) },
      status: { $in: ["failed", "skipped"] },
    })
      .select("filepath status retryCount errorCode")
      .lean();
    const blockedLivePathSet = new Set(
      nonReadyRows
        .filter((row) => {
          const status = String(row?.status || "");
          const errorCode = String(row?.errorCode || "").toLowerCase();
          if (status === "skipped") {
            return errorCode === "no_face" || errorCode === "not_image_or_invalid";
          }
          return false;
        })
        .map((row) => String(row?.filepath || "").trim())
        .filter(Boolean)
    );

    if (indexedRowsInWorkspace.length) {
      try {
        const queryEmbeddings = await fetchEmbeddingsForImage({
          scanImageBase64,
          scanImageUrl,
          providerTimeoutMs,
        });

        indexedRowsInWorkspace.forEach((row) => {
          const candidateEmbeddings = Array.isArray(row.embeddings) ? row.embeddings : [];
          if (!candidateEmbeddings.length) return;
          const { score, queryFaceIndex, candidateFaceIndex } = getBestFacePairScore(
            queryEmbeddings,
            candidateEmbeddings
          );
          if (score < threshold) return;
          indexedMatches.push({
            path: row.filepath,
            name: row.fileName || "",
            score,
            confidence: score,
            queryFaceIndex,
            candidateFaceIndex,
            queryFacesDetected: queryEmbeddings.length,
            candidateFacesDetected: candidateEmbeddings.length,
          });
        });
      } catch (error) {
        if (isNoFaceDetectedError(error)) {
          // We'll still try live scan branch below, and if provider also returns no-face we respond gracefully.
        } else {
          throw error;
        }
      }
    }

    const hasIndexedData = indexedRowsInWorkspace.length > 0;
    const liveCandidatesBase = hasIndexedData
      ? allCandidates.filter((candidate) => !indexedPathSet.has(String(candidate.path || "").trim()))
      : allCandidates;
    const liveCandidates = liveCandidatesBase.filter(
      (candidate) => !blockedLivePathSet.has(String(candidate.path || "").trim())
    );

    const requestedLiveCandidateLimit = hasIndexedData
      ? toPositiveInteger(req.body.fallbackCandidateLimit, FACE_SCAN_FALLBACK_MAX_CANDIDATES)
      : toPositiveInteger(req.body.candidateLimit, FACE_SCAN_MAX_CANDIDATES);
    const liveCandidateLimit = Math.min(requestedLiveCandidateLimit, FACE_SCAN_LIVE_CANDIDATE_LIMIT_MAX);

    const backgroundReindexEnabled = req.body.backgroundReindex !== false;
    const queuedForBackgroundIndex = backgroundReindexEnabled
      ? scheduleBackgroundReindex({
          externalId,
          candidates: liveCandidates,
          candidateLimit: toPositiveInteger(
            req.body.backgroundBatchLimit,
            FACE_SCAN_BACKGROUND_REINDEX_BATCH
          ),
          concurrency: toPositiveInteger(
            req.body.backgroundConcurrency,
            FACE_SCAN_BACKGROUND_REINDEX_CONCURRENCY
          ),
          providerTimeoutMs,
        })
      : 0;

    let liveSearchResult = {
      scannedCandidatesCount: 0,
      matches: [],
      provider: "deepface",
    };
    const hasIndexedMatches = indexedMatches.length > 0;
    const shouldRunLiveFallback = req.body.includeLiveFallback === true || !hasIndexedMatches;
    let noFaceDetectedInScanImage = false;
    if (shouldRunLiveFallback) {
      try {
        liveSearchResult = await runProviderFaceSearch({
          externalId,
          scanImageBase64,
          scanImageUrl,
          threshold,
          maxResults,
          providerTimeoutMs,
          candidates: liveCandidates.slice(0, liveCandidateLimit),
        });
      } catch (error) {
        if (isNoFaceDetectedError(error)) {
          noFaceDetectedInScanImage = true;
        } else {
          throw error;
        }
      }
    }

    const mergedMatches = mergeFaceMatchesByBestScore([
      ...indexedMatches,
      ...(liveSearchResult.matches || []),
    ])
      .filter((item) => Number(item?.score || item?.confidence || 0) >= minScore)
      .slice(0, maxResults);
    const scanMode = hasIndexedData ? "indexed_plus_fallback_scan" : "full_face_scan";
    const provider = hasIndexedData
      ? `deepface-indexed+${liveSearchResult.provider || "deepface"}`
      : liveSearchResult.provider || "deepface";
    const workspaceIndexStatus = await getWorkspaceFaceIndexSummary(externalId, allCandidates);

    return res.status(httpStatus.OK).json({
      success: true,
      message: "Face scan completed",
      data: {
        externalId,
        scanMode,
        integrated: true,
        candidatesCount: allCandidates.length,
        indexedCandidatesCount: indexedRowsInWorkspace.length,
        scannedCandidatesCount:
          (hasIndexedData ? indexedRowsInWorkspace.length : 0) +
          liveSearchResult.scannedCandidatesCount,
        liveFallbackTriggered: shouldRunLiveFallback,
        backgroundIndexQueued: queuedForBackgroundIndex,
        noFaceDetectedInScanImage,
        minScore,
        indexStatus: workspaceIndexStatus,
        matches: mergedMatches,
        provider,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getFaceScanIndexStatus = async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const externalId = normalizeExternalId(
      req.params.externalId || req.query.externalId || body.externalId || body.eventExternalId
    );
    if (!externalId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "externalId is required",
      });
    }

    const candidates = await listWorkspaceImageCandidates(externalId);
    const summary = await getWorkspaceFaceIndexSummary(externalId, candidates);

    return res.status(httpStatus.OK).json({
      success: true,
      message: "Face index status fetched",
      data: {
        externalId,
        ...summary,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.reindexFaceEmbeddings = async (req, res, next) => {
  try {
    const externalId = normalizeExternalId(req.body.externalId || req.body.eventExternalId);
    if (!externalId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "externalId is required",
      });
    }

    const candidateLimit = Math.min(
      toPositiveInteger(req.body.candidateLimit, 2000),
      FACE_SCAN_REINDEX_CANDIDATE_LIMIT_MAX
    );
    const concurrency = toPositiveInteger(req.body.concurrency, FACE_SCAN_INDEX_CONCURRENCY);
    const providerTimeoutMs = resolveProviderTimeoutMs(req.body.providerTimeoutMs);

    const allCandidates = await listWorkspaceImageCandidates(externalId);
    const selectedCandidates = allCandidates.slice(0, candidateLimit);
    const runInBackground = req.body.sync !== true;

    if (runInBackground) {
      const queued = scheduleBackgroundReindex({
        externalId,
        candidates: selectedCandidates,
        candidateLimit: selectedCandidates.length,
        concurrency,
        providerTimeoutMs,
      });
      const indexStatus = await getWorkspaceFaceIndexSummary(externalId, allCandidates);

      return res.status(httpStatus.OK).json({
        success: true,
        message: "Face embedding reindex queued",
        data: {
          externalId,
          mode: "background",
          totalCandidates: allCandidates.length,
          selectedCandidates: selectedCandidates.length,
          queuedCandidates: queued,
          indexStatus,
        },
      });
    }

    const summary = {
      externalId,
      totalCandidates: allCandidates.length,
      selectedCandidates: selectedCandidates.length,
      indexed: 0,
      skipped: 0,
      failed: 0,
    };

    await runWithConcurrency(selectedCandidates, concurrency, async (candidate) => {
      const result = await indexEmbeddingForCandidate({
        externalId,
        filepath: candidate.path,
        fileName: candidate.name,
        contentType: candidate.contentType,
        providerTimeoutMs,
      });
      if (result.status === "indexed") summary.indexed += 1;
      else if (result.status === "failed") summary.failed += 1;
      else summary.skipped += 1;
    });

    return res.status(httpStatus.OK).json({
      success: true,
      message: "Face embedding reindex completed",
      data: summary,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getFileViewUrl = async (req, res, next) => {
  try {
    const filePath = normalizeWorkspacePath(req.body.filepath || req.query.filepath);

    if (!filePath) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "filepath is required",
      });
    }

    const result = await gcpFileService.downloadFiles(
      filePath.startsWith("Website_Shoots_Flow/")
        ? filePath
        : `Website_Shoots_Flow/${filePath}`,
      false
    );

    return res.status(httpStatus.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getFileDownloadUrl = async (req, res, next) => {
  try {
    const filePath = normalizeWorkspacePath(req.body.filepath || req.query.filepath);

    if (!filePath) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "filepath is required",
      });
    }

    const result = await gcpFileService.downloadFiles(
      filePath.startsWith("Website_Shoots_Flow/")
        ? filePath
        : `Website_Shoots_Flow/${filePath}`,
      true
    );

    return res.status(httpStatus.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getFolderDownloadUrl = async (req, res, next) => {
  try {
    const externalId = normalizeExternalId(req.body.externalId || req.query.externalId);
    const phase = String(req.body.phase || req.query.phase || "root").trim().toLowerCase();
    const subPath = String(req.body.path || req.query.path || "").trim();

    if (!externalId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "externalId is required",
      });
    }

    const workspace = await findWorkspaceRoot(externalId);
    if (!workspace) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Workspace not found",
      });
    }

    const basePath = resolveWorkspaceBasePath(workspace.path, phase, subPath);
    const cleanPath = normalizeWorkspacePath(basePath);

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        url: buildFolderDownloadUrl(req, cleanPath),
        filepath: cleanPath,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteEntry = async (req, res, next) => {
  try {
    const filePath = normalizeWorkspacePath(req.body.filepath || req.body.path || "");

    if (!filePath) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "filepath is required",
      });
    }

    const pathWithSlash = filePath.endsWith("/") ? filePath : `${filePath}/`;
    const pathWithoutSlash = filePath.endsWith("/") ? filePath.slice(0, -1) : filePath;
    const folderDoc = await FileMeta.findOne({
      isFolder: true,
      path: { $in: [pathWithSlash, pathWithoutSlash] },
    }).lean();

    const isFolderDelete = Boolean(folderDoc?.isFolder);
    const effectivePath = isFolderDelete ? pathWithSlash : filePath;
    const targetPath = effectivePath.startsWith("Website_Shoots_Flow/")
      ? effectivePath
      : `Website_Shoots_Flow/${effectivePath}`;

    const result = await gcpFileService.deleteFile(targetPath);

    const escapedRoot = pathWithoutSlash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathRegex = new RegExp(`^${escapedRoot}/`);
    const extraDeleteFilter = {
      $or: [
        { path: pathWithSlash },
        { path: pathWithoutSlash },
        { path: pathRegex },
      ],
    };

    const orderId = folderDoc?.metadata?.orderId;
    if (orderId && isRootWorkspacePath(pathWithoutSlash)) {
      extraDeleteFilter.$or.push({
        isFolder: true,
        parentFolderId: null,
        path: { $regex: /^[^/]+\/?$/ },
        "metadata.orderId": String(orderId),
      });
    }

    const metadataCleanup = await FileMeta.deleteMany(extraDeleteFilter);
    const embeddingCleanup = await FaceEmbedding.deleteMany({
      $or: [{ filepath: pathWithoutSlash }, { filepath: pathWithSlash }, { filepath: pathRegex }],
    });

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        ...result,
        metadataDeletedCount: metadataCleanup.deletedCount || 0,
        embeddingDeletedCount: embeddingCleanup.deletedCount || 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};
