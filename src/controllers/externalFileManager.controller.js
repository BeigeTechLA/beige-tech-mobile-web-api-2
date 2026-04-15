const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { FileMeta } = require("../models");
const gcpFileService = require("../services/gcpFile.service");

const normalizeExternalId = (value) => String(value || "").trim();
const isRootWorkspacePath = (value) => !String(value || "").replace(/\/$/, "").includes("/");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    return res.status(httpStatus.OK).json({
      success: true,
      data: {
        ...result,
        metadataDeletedCount: metadataCleanup.deletedCount || 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};
