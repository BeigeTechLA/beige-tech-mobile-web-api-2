const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { FileMeta, FaceEmbedding } = require("../models");
const gcpFileService = require("../services/gcpFile.service");

const FACE_SCAN_SERVICE_URL = process.env.FACE_SCAN_SERVICE_URL || "http://localhost:8000";
const FACE_SCAN_PROVIDER_TIMEOUT_MS = Math.max(
  15000,
  Number(process.env.FACE_SCAN_PROVIDER_TIMEOUT_MS || 3000000)
);
const FACE_SCAN_MAX_CANDIDATES = Math.max(25, Number(process.env.FACE_SCAN_MAX_CANDIDATES || 80));
const FACE_SCAN_FALLBACK_MAX_CANDIDATES = Math.max(
  50,
  Number(process.env.FACE_SCAN_FALLBACK_MAX_CANDIDATES || 400)
);
const FACE_SCAN_INDEX_CONCURRENCY = Math.max(1, Number(process.env.FACE_SCAN_INDEX_CONCURRENCY || 3));

const normalizeExternalId = (value) => String(value || "").trim();
const isRootWorkspacePath = (value) => !String(value || "").replace(/\/$/, "").includes("/");

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
  const parentFolder = await FileMeta.findOne({
    path: folderPath,
    isFolder: true,
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

  try {
    const scanImageUrl = await getFileSignedViewUrl(normalizedPath);
    if (!scanImageUrl) {
      await upsertFaceEmbedding({
        externalId,
        filepath: normalizedPath,
        fileName,
        contentType,
        embeddings: [],
        status: "failed",
        errorMessage: "Missing file view URL",
      });
      return { status: "failed", reason: "missing_view_url" };
    }

    const embeddings = await fetchEmbeddingsForImage({ scanImageUrl, providerTimeoutMs });
    if (!embeddings.length) {
      await upsertFaceEmbedding({
        externalId,
        filepath: normalizedPath,
        fileName,
        contentType,
        embeddings: [],
        status: "failed",
        errorMessage: "No face detected",
      });
      return { status: "failed", reason: "no_face" };
    }

    await upsertFaceEmbedding({
      externalId,
      filepath: normalizedPath,
      fileName,
      contentType,
      embeddings,
      status: "ready",
      errorMessage: null,
    });

    return { status: "indexed", facesCount: embeddings.length };
  } catch (error) {
    await upsertFaceEmbedding({
      externalId,
      filepath: normalizedPath,
      fileName,
      contentType,
      embeddings: [],
      status: "failed",
      errorMessage: error?.message || "Face indexing failed",
    });
    return { status: "failed", reason: error?.message || "Face indexing failed" };
  }
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

exports.getUploadPolicy = async (req, res, next) => {
  try {
    const cleanPath = normalizeWorkspacePath(req.body.filepath);
    const fileContentType = String(req.body.fileContentType || "").trim();
    const fileSize = Number(req.body.fileSize || 0);
    const userId = req.body.userId ? String(req.body.userId).trim() : null;

    if (!cleanPath || !fileContentType || !fileSize) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "filepath, fileContentType and fileSize are required",
      });
    }

    const { parentFolder } = await getParentFolderMetadata(cleanPath);
    if (!parentFolder) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Parent folder not found",
      });
    }

    const result = await gcpFileService.uploadFile(
      `Website_Shoots_Flow/${cleanPath}`.replace(/\/+/g, "/"),
      fileContentType,
      fileSize,
      userId,
      {
        orderId: parentFolder.metadata?.orderId || null,
      }
    );

    return res.status(httpStatus.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

exports.completeUpload = async (req, res, next) => {
  try {
    const cleanPath = normalizeWorkspacePath(req.body.filepath);
    const fileContentType = String(req.body.fileContentType || "application/octet-stream").trim();
    const fileSize = Number(req.body.fileSize || 0);
    const fileName = String(req.body.fileName || cleanPath.split("/").pop() || "").trim();
    const userId = req.body.userId ? String(req.body.userId).trim() : null;
    const authorName = String(req.body.authorName || "Beige User").trim();
    const mongoUserId = toMongoUserIdOrNull(userId);

    if (!cleanPath || !userId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "filepath and userId are required",
      });
    }

    const { parentFolder } = await getParentFolderMetadata(cleanPath);
    const folderMetadata = {
      cpIds: parentFolder?.metadata?.cpIds || [],
      orderId: parentFolder?.metadata?.orderId || null,
      externalUserId: userId || null,
    };

    const existingFile = await FileMeta.findOne({ path: cleanPath });
    const touchedAt = new Date();
    if (existingFile) {
      existingFile.size = fileSize;
      existingFile.contentType = fileContentType;
      existingFile.updatedAt = touchedAt;
      existingFile.metadata = {
        ...existingFile.metadata,
        cpIds: folderMetadata.cpIds,
        orderId: folderMetadata.orderId,
      };
      if (!existingFile.author || existingFile.author === "Unknown") {
        existingFile.author = authorName;
      }
      await existingFile.save();
      await touchFolderHierarchy(cleanPath, touchedAt);

      if (folderMetadata.orderId) {
        void indexEmbeddingForCandidate({
          externalId: folderMetadata.orderId,
          filepath: cleanPath,
          fileName,
          contentType: fileContentType,
          providerTimeoutMs: toPositiveInteger(req.body.providerTimeoutMs, FACE_SCAN_PROVIDER_TIMEOUT_MS),
        }).then((indexResult) => {
          if (indexResult?.status === "failed") {
            console.warn("[face-index] upload-index-failed", {
              externalId: folderMetadata.orderId,
              filepath: cleanPath,
              reason: indexResult?.reason || "unknown",
            });
          }
        });
      }

      return res.status(httpStatus.OK).json({
        success: true,
        message: "File metadata updated",
        data: {
          id: existingFile._id.toString(),
          path: existingFile.path,
          name: existingFile.name,
          size: existingFile.size,
        },
      });
    }

    const fileDoc = await FileMeta.create({
      path: cleanPath,
      name: fileName,
      userId: mongoUserId,
      isFolder: false,
      contentType: fileContentType,
      size: fileSize,
      isPublic: false,
      author: authorName,
      fullPath: `Website_Shoots_Flow/${cleanPath}`,
      metadata: {
        cpIds: folderMetadata.cpIds,
        orderId: folderMetadata.orderId,
      },
      createdAt: touchedAt,
      updatedAt: touchedAt,
    });

    await touchFolderHierarchy(cleanPath, touchedAt);

    if (folderMetadata.orderId) {
      void indexEmbeddingForCandidate({
        externalId: folderMetadata.orderId,
        filepath: cleanPath,
        fileName,
        contentType: fileContentType,
        providerTimeoutMs: toPositiveInteger(req.body.providerTimeoutMs, FACE_SCAN_PROVIDER_TIMEOUT_MS),
      }).then((indexResult) => {
        if (indexResult?.status === "failed") {
          console.warn("[face-index] upload-index-failed", {
            externalId: folderMetadata.orderId,
            filepath: cleanPath,
            reason: indexResult?.reason || "unknown",
          });
        }
      });
    }

    return res.status(httpStatus.CREATED).json({
      success: true,
      message: "File metadata created",
      data: {
        id: fileDoc._id.toString(),
        path: fileDoc.path,
        name: fileDoc.name,
        size: fileDoc.size,
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
    const providerTimeoutMs = toPositiveInteger(
      req.body.providerTimeoutMs,
      FACE_SCAN_PROVIDER_TIMEOUT_MS
    );

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
    const indexedRows = await FaceEmbedding.find({
      externalId,
      status: "ready",
    })
      .select("filepath fileName embeddings facesCount")
      .sort({ updatedAt: -1 })
      .lean();

    const indexedMatches = [];
    const indexedPathSet = new Set(indexedRows.map((row) => String(row.filepath || "").trim()).filter(Boolean));

    if (indexedRows.length) {
      const queryEmbeddings = await fetchEmbeddingsForImage({
        scanImageBase64,
        scanImageUrl,
        providerTimeoutMs,
      });

      indexedRows.forEach((row) => {
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
    }

    const hasIndexedData = indexedRows.length > 0;
    const liveCandidates = hasIndexedData
      ? allCandidates.filter((candidate) => !indexedPathSet.has(String(candidate.path || "").trim()))
      : allCandidates;

    const liveCandidateLimit = hasIndexedData
      ? toPositiveInteger(req.body.fallbackCandidateLimit, FACE_SCAN_FALLBACK_MAX_CANDIDATES)
      : toPositiveInteger(req.body.candidateLimit, FACE_SCAN_MAX_CANDIDATES);

    const liveSearchResult = await runProviderFaceSearch({
      externalId,
      scanImageBase64,
      scanImageUrl,
      threshold,
      maxResults,
      providerTimeoutMs,
      candidates: liveCandidates.slice(0, liveCandidateLimit),
    });

    const mergedMatches = mergeFaceMatchesByBestScore([
      ...indexedMatches,
      ...(liveSearchResult.matches || []),
    ]).slice(0, maxResults);
    const scanMode = hasIndexedData ? "indexed_plus_fallback_scan" : "full_face_scan";
    const provider = hasIndexedData
      ? `deepface-indexed+${liveSearchResult.provider || "deepface"}`
      : liveSearchResult.provider || "deepface";

    return res.status(httpStatus.OK).json({
      success: true,
      message: "Face scan completed",
      data: {
        externalId,
        scanMode,
        integrated: true,
        candidatesCount: allCandidates.length,
        indexedCandidatesCount: indexedRows.length,
        scannedCandidatesCount: (hasIndexedData ? indexedRows.length : 0) + liveSearchResult.scannedCandidatesCount,
        matches: mergedMatches,
        provider,
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

    const candidateLimit = toPositiveInteger(req.body.candidateLimit, 2000);
    const concurrency = toPositiveInteger(req.body.concurrency, FACE_SCAN_INDEX_CONCURRENCY);
    const providerTimeoutMs = toPositiveInteger(
      req.body.providerTimeoutMs,
      FACE_SCAN_PROVIDER_TIMEOUT_MS
    );

    const allCandidates = await listWorkspaceImageCandidates(externalId);
    const selectedCandidates = allCandidates.slice(0, candidateLimit);

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
