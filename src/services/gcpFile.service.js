const { Storage } = require("@google-cloud/storage");
const config = require("../config/config");
const ApiError = require("../utils/ApiError");
const httpStatus = require("http-status");
const archiver = require("archiver");
const orderService = require("../services/order.service");
const userService = require("../services/user.service");
const getLastFiveChars = require("../utils/getLastFiveCharc");
const fs = require("fs");
const logger = require("../config/logger");
const { FileMeta } = require("../models");

const DEFAULT_SETTINGS = {
  defaultPublicFiles: false,
  privateUrlExpiration: 7,
  cdnAdmins: "",
};

// Helper function to encode URL path segments while preserving slashes
// This prevents double-encoding issues where '/' becomes '%2F'
const encodeUrlPath = (path) => {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
};

// Helper function to sanitize filename to prevent issues with special unicode characters
// This normalizes unicode characters and replaces problematic ones
const sanitizeFilename = (filename) => {
  // Normalize unicode to NFD (Canonical Decomposition) then to NFC (Canonical Composition)
  let sanitized = filename.normalize('NFC');

  // Replace special unicode spaces with regular spaces
  sanitized = sanitized.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');

  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Trim leading/trailing spaces
  sanitized = sanitized.trim();

  // Replace potentially problematic characters but keep alphanumeric, spaces, dots, dashes, underscores
  sanitized = sanitized.replace(/[^\w\s.-]/g, '_');

  return sanitized;
};

// Check if GCP credentials file exists before initializing
let bucket = null;
let gcpEnabled = false;

try {
  if (config.GCP.keyFilename && fs.existsSync(config.GCP.keyFilename)) {
    bucket = new Storage({
      keyFilename: config.GCP.keyFilename,
    }).bucket(config.GCP.bucketName);
    gcpEnabled = true;
    logger.info("GCP Storage initialized successfully");
  } else {
    logger.warn("GCP credentials file not found - GCP features will be disabled");
  }
} catch (error) {
  logger.warn(`GCP Storage initialization failed: ${error.message} - GCP features will be disabled`);
}

const CDN_URL = process.env.CDN_URL || null;
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || "*";
const UPLOAD_FOLDER_METADATA_CACHE_TTL_MS = Math.max(
  10000,
  Number(process.env.UPLOAD_FOLDER_METADATA_CACHE_TTL_MS || 120000)
);
const uploadFolderMetadataCache = new Map();

// let CDN_ADMINS = [process.env.CDN_ADMIN];
let CDN_ADMINS = [config.GCP.cdnAdmins];
let PRIVATE_URL_EXPIRY_DAYS = DEFAULT_SETTINGS.privateUrlExpiration;

async function getUserSettings() {
  if (!gcpEnabled || !bucket) return DEFAULT_SETTINGS;
  if (!(await bucket.file(config.GCP.keyFilename).exists())[0])
    return DEFAULT_SETTINGS; // Settings don't exist, return defaults
  return JSON.parse(
    (await bucket.file(config.GCP.keyFilename).download())[0].toString("utf8")
  );
}

async function updateWithUserSettings() {
  if (!gcpEnabled) return;
  const userSettings = await getUserSettings();
  if (!userSettings.useSettings) return;
  PRIVATE_URL_EXPIRY_DAYS = userSettings.privateUrlExpiration;
  CDN_ADMINS = [process.env.CDN_ADMIN];
  // CDN_ADMINS.push(...userSettings?.cdnAdmins?.split(","));
}

updateWithUserSettings();

// Helper function to check if GCP is available
const checkGcpEnabled = () => {
  if (!gcpEnabled || !bucket) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, "GCP Storage is not configured");
  }
};

let CorsAlreadyChecked = false;
async function setBucketCors() {
  if (!gcpEnabled || !bucket) return;
  if (CorsAlreadyChecked) return;
  const corsSetFlag = bucket.file(".bucket.cors-configured");
  if ((await corsSetFlag.exists())[0]) {
    CorsAlreadyChecked = true;
    return;
  }
  const corsConfig = [
    {
      method: ["*"],
      origin: [DASHBOARD_ORIGIN],
      responseHeader: ["*"],
    },
  ];
  await bucket.setCorsConfiguration(corsConfig);
  await corsSetFlag.save(
    `This bucket's CORS has been set to allow request from the file manager`
  );
  CorsAlreadyChecked = true;
}

const getCachedFolderCreatedByUsers = async (folderPath = "") => {
  if (!folderPath) return [];
  const cacheKey = String(folderPath || "").toLowerCase();
  const now = Date.now();
  const cached = uploadFolderMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.userIds;
  }

  let userIds = [];
  try {
    const folder = bucket.file(folderPath);
    const [exists] = await folder.exists();
    if (exists) {
      const [folderMetadata] = await folder.getMetadata();
      const createdBy = folderMetadata?.metadata?.createdBy;

      if (typeof createdBy === "string") {
        try {
          const parsed = JSON.parse(createdBy);
          userIds = Array.isArray(parsed) ? parsed.map((id) => String(id)) : [String(createdBy)];
        } catch (parseError) {
          userIds = [String(createdBy)];
        }
      } else if (Array.isArray(createdBy)) {
        userIds = createdBy.map((id) => String(id));
      }
    }
  } catch (error) {
    logger.warn(`Failed to load folder metadata cache for ${folderPath}: ${error.message}`);
  }

  const deduped = [...new Set(userIds.filter(Boolean))];
  uploadFolderMetadataCache.set(cacheKey, {
    userIds: deduped,
    expiresAt: now + UPLOAD_FOLDER_METADATA_CACHE_TTL_MS,
  });
  return deduped;
};

const createFolder = async (
  folderName,
  cpIds,
  orderId,
  client_id,
  shootName = null,
  clientName = null,
  shootId = null,
  createOptions = {}
) => {
  checkGcpEnabled();
  let options = {};
  const shouldSkipWorkflowSubfolders = Boolean(createOptions?.skipWorkflowSubfolders);

  // Determine the userId - prioritize client_id, then try to extract from cpIds
  let userId = client_id;
  if (!userId && cpIds?.length > 0) {
    // If cpIds is provided but client_id is not, use the first CP id
    const firstCp = cpIds.find((item) => item.id);
    if (firstCp) {
      userId = firstCp.id;
    }
  }

  if (cpIds?.length > 0 || orderId) {
    // Normalize cpIds to handle both string and object formats
    // e.g., ['cpId1', 'cpId2'] or [{ id: 'cpId1' }, { id: 'cpId2' }]
    const idsArray = cpIds ? cpIds.map((item) => {
      if (typeof item === 'string') return item;
      if (item && item.id) return item.id.toString();
      return item?.toString();
    }).filter(Boolean) : [];

    // Add client_id to the array if provided and not already present
    const allIds = client_id
      ? [...new Set([...idsArray, client_id.toString()])]
      : idsArray;

    options = {
      metadata: {
        metadata: {
          createdBy: JSON.stringify(allIds),
          orderId: JSON.stringify(orderId),
        },
      },
    };
  }

  // Check and create Website_Shoots_Flow folder if it doesn't exist
  const shootsFolder = bucket.file("Website_Shoots_Flow/");
  const [shootsExists] = await shootsFolder.exists();
  if (!shootsExists) {
    await shootsFolder.save("");
  }

  // Create new folder inside shoots with the new naming convention
  // Format: ShootName_ClientName_ShootID
  let finalFolderName = folderName;
  if (shootName && clientName && shootId) {
    finalFolderName = `${shootName}_${clientName}_${shootId}`;
  }

  // Check if folderName already starts with 'Website_Shoots_Flow/' to prevent duplication
  const folderPath = finalFolderName.startsWith("Website_Shoots_Flow/")
    ? finalFolderName
    : `Website_Shoots_Flow/${finalFolderName}`;
  // Normalize path by replacing multiple consecutive slashes with a single slash
  const normalizedPath = folderPath.replace(/\/+/g, "/");

  // Ensure folder path ends with /
  const folderPathWithSlash = normalizedPath.endsWith("/") ? normalizedPath : normalizedPath + "/";

  // Extract the folder name (without Website_Shoots_Flow/ prefix and trailing /)
  const pathWithoutPrefix = folderPathWithSlash.replace("Website_Shoots_Flow/", "");
  const folderDisplayName = pathWithoutPrefix.replace(/\/$/, "").split("/").filter(Boolean).pop() || pathWithoutPrefix.replace(/\/$/, "");

  try {
    const newFolder = bucket.file(folderPathWithSlash);
    const [exists] = await newFolder.exists();

    // Save the folder to GCS with or without metadata based on cpIds
    // Only save to GCS if it doesn't exist already
    if (!exists) {
      await newFolder.save("", options);
      console.log('✅ Folder saved to GCS:', folderPathWithSlash);
    } else {
      console.log('📁 Folder already exists in GCS:', folderPathWithSlash);
    }

    // Check if folder already exists in database regardless of userId
    let folderDoc = null;
    let existingFolder = await FileMeta.findOne({
      path: pathWithoutPrefix
    });

    // If folder exists in database, update it if there are changes to metadata
    if (existingFolder) {
      console.log('Folder already exists in database:', pathWithoutPrefix);

      // Check if we need to update the metadata (especially cpIds)
      let needsUpdate = false;
      if (cpIds && Array.isArray(cpIds) && cpIds.length > 0) {
        // Check if cpIds are different
        const existingCpIds = existingFolder.metadata?.cpIds || [];
        const existingCpIdsSet = new Set(existingCpIds.map(cp => cp.id || cp));
        const newCpIdsSet = new Set(cpIds.map(cp => cp.id || cp));

        if (existingCpIdsSet.size !== newCpIdsSet.size ||
            ![...existingCpIdsSet].every(id => newCpIdsSet.has(id)) ||
            ![...newCpIdsSet].every(id => existingCpIdsSet.has(id))) {
          needsUpdate = true;
        }
      }

      if (orderId && existingFolder.metadata?.orderId !== orderId) {
        needsUpdate = true;
      }

      if (needsUpdate) {
        existingFolder.metadata = {
          orderId: orderId || existingFolder.metadata?.orderId || null,
          cpIds: cpIds || existingFolder.metadata?.cpIds || []
        };
        await existingFolder.save();
        console.log('✅ Folder metadata updated in database:', existingFolder._id);
      }

      folderDoc = existingFolder;
    } else {
      // Create new folder in database if it doesn't exist
      try {
        // Normalize cpIds to simple string array for reliable querying
        const normalizedCpIds = cpIds ? cpIds.map((item) => {
          if (typeof item === 'string') return item;
          if (item && item.id) return item.id.toString();
          return item?.toString();
        }).filter(Boolean) : [];

        folderDoc = await FileMeta.create({
          path: pathWithoutPrefix,
          name: folderDisplayName,
          userId: userId || null, // Allow null userId for system-created folders
          isFolder: true,
          contentType: "folder",
          size: 0,
          isPublic: false,
          fullPath: folderPathWithSlash,
          metadata: {
            orderId: orderId?.toString() || null,
            cpIds: normalizedCpIds, // Store as simple string array for reliable querying
            shootName: shootName,
            clientName: clientName,
            shootId: shootId
          }
        });

        console.log('✅ Folder metadata saved to database:', folderDoc._id, 'cpIds:', normalizedCpIds);
      } catch (dbError) {
        console.error('❌ Error saving folder to database:', dbError);
        // Continue even if database save fails - GCS folder is created
      }
    }

    // Create production workflow subfolders ONLY for client folders (not custom folders)
    // Client folders are identified by having an orderId, shootName, or clientName
    // Custom folders created manually by users should NOT have workflow subfolders
    const isClientFolder = Boolean(orderId || shootName || clientName);
    const normalizedFolderPath = pathWithoutPrefix.replace(/\/$/, "");
    const isRootFolder = !normalizedFolderPath.includes("/");
    const shouldCreateWorkflowSubfolders =
      folderDoc &&
      isClientFolder &&
      isRootFolder &&
      !shouldSkipWorkflowSubfolders;

    if (shouldCreateWorkflowSubfolders) {
      try {
        await createProductionSubfolders(
          pathWithoutPrefix,
          folderDoc._id,
          cpIds,
          orderId,
          userId
        );
        console.log('✅ Production workflow subfolders created successfully for client folder');
      } catch (subfolderError) {
        console.error('⚠️ Error creating production subfolders:', subfolderError);
        // Don't fail the main folder creation if subfolder creation fails
      }
    } else if (folderDoc && shouldSkipWorkflowSubfolders) {
      console.log('ℹ️ Skipping workflow subfolder creation - explicitly disabled for this request');
    } else if (folderDoc && !isRootFolder) {
      console.log('ℹ️ Skipping workflow subfolder creation - this is a nested folder');
    } else if (folderDoc) {
      console.log('ℹ️ Skipping workflow subfolder creation - this is a custom folder, not a client folder');
    }

    return {
      saved: true,
      folder: folderDoc ? {
        id: folderDoc._id.toString(),
        path: folderDoc.path,
        name: folderDoc.name,
        isFolder: true
      } : null
    };
  } catch (error) {
    console.error("Error saving folder:", error);
    return { error: "save-error" };
  }
};

/**
 * Create postproduction subfolders (Raw Footage, Edited Footage, Final Deliverables)
 * @param {string} parentPath - Parent folder path (without Website_Shoots_Flow/ prefix)
 * @param {ObjectId} parentFolderId - Parent folder's MongoDB _id
 * @param {Array} cpIds - Array of CP IDs
 * @param {string} orderId - Order ID
 * @param {string} userId - User/Client ID
 */
const createPostProductionSubfolders = async (parentPath, parentFolderId, cpIds, orderId, userId) => {
  const postProductionSubfolders = ['Raw Footage', 'Edited Footage', 'Final Deliverables'];

  // Normalize cpIds to simple string array
  const normalizedCpIds = cpIds ? cpIds.map((item) => {
    if (typeof item === 'string') return item;
    if (item && item.id) return item.id.toString();
    return item?.toString();
  }).filter(Boolean) : [];

  for (const subfolderName of postProductionSubfolders) {
    const subfolderPath = `${parentPath.replace(/\/$/, '')}/${subfolderName}/`;
    const gcsFolderPath = `Website_Shoots_Flow/${subfolderPath}`;

    try {
      // Create folder in GCS
      const newFolder = bucket.file(gcsFolderPath);
      const [exists] = await newFolder.exists();

      if (!exists) {
        const options = {
          metadata: {
            metadata: {
              createdBy: JSON.stringify(normalizedCpIds),
              orderId: JSON.stringify(orderId),
              folderType: 'postproduction_subfolder', // Special type for postproduction subfolders
              subfolderName: subfolderName
            },
          },
        };
        await newFolder.save("", options);
        console.log(`✅ Created GCS Post-Production subfolder: ${gcsFolderPath}`);
      }

      // Check if subfolder already exists in database
      let existingSubfolder = await FileMeta.findOne({ path: subfolderPath });

      if (!existingSubfolder) {
        // Determine specific folder type for permissions
        let specificFolderType = 'postproduction_raw_footage';
        if (subfolderName === 'Edited Footage') {
          specificFolderType = 'postproduction_edited_footage';
        } else if (subfolderName === 'Final Deliverables') {
          specificFolderType = 'postproduction_final_deliverables';
        }

        // Create subfolder record in database
        await FileMeta.create({
          path: subfolderPath,
          name: subfolderName,
          userId: userId || null,
          isFolder: true,
          contentType: "folder",
          size: 0,
          isPublic: false,
          fullPath: gcsFolderPath,
          folderType: specificFolderType,
          parentFolderId: parentFolderId,
          metadata: {
            orderId: orderId?.toString() || null,
            cpIds: normalizedCpIds,
            originalFolderType: 'postproduction', // Keep track of the parent type
            subfolderName: subfolderName
          }
        });
        console.log(`✅ Created database record for Post-Production subfolder: ${subfolderName}`);
      } else {
        console.log(`📁 Post-Production subfolder already exists in database: ${subfolderName}`);
      }
    } catch (error) {
      console.error(`❌ Error creating Post-Production subfolder ${subfolderName}:`, error);
      throw error;
    }
  }
};

/**
 * Create postproduction workflow subfolders only (Raw Footage, Edited Footage, Final Deliverables)
 * @param {string} parentPath - Parent folder path (without Website_Shoots_Flow/ prefix)
 * @param {ObjectId} parentFolderId - Parent folder's MongoDB _id
 * @param {Array} cpIds - Array of CP IDs
 * @param {string} orderId - Order ID
 * @param {string} userId - User/Client ID
 */
const createPostProductionSubfoldersOnly = async (parentPath, parentFolderId, cpIds, orderId, userId) => {
  const postProductionSubfolders = ['Raw Footage', 'Edited Footage', 'Final Deliverables'];

  // Normalize cpIds to simple string array
  const normalizedCpIds = cpIds ? cpIds.map((item) => {
    if (typeof item === 'string') return item;
    if (item && item.id) return item.id.toString();
    return item?.toString();
  }).filter(Boolean) : [];

  for (const subfolderName of postProductionSubfolders) {
    const subfolderPath = `${parentPath.replace(/\/$/, '')}/${subfolderName}/`;
    const gcsFolderPath = `Website_Shoots_Flow/${subfolderPath}`;

    try {
      // Create folder in GCS
      const newFolder = bucket.file(gcsFolderPath);
      const [exists] = await newFolder.exists();

      if (!exists) {
        const options = {
          metadata: {
            metadata: {
              createdBy: JSON.stringify(normalizedCpIds),
              orderId: JSON.stringify(orderId),
              folderType: 'postproduction_subfolder', // Special type for postproduction subfolders
              subfolderName: subfolderName
            },
          },
        };
        await newFolder.save("", options);
        console.log(`✅ Created GCS Post-Production subfolder: ${gcsFolderPath}`);
      }

      // Check if subfolder already exists in database
      let existingSubfolder = await FileMeta.findOne({ path: subfolderPath });

      if (!existingSubfolder) {
        // Determine specific folder type for permissions
        let specificFolderType = 'postproduction_raw_footage';
        if (subfolderName === 'Edited Footage') {
          specificFolderType = 'postproduction_edited_footage';
        } else if (subfolderName === 'Final Deliverables') {
          specificFolderType = 'postproduction_final_deliverables';
        }

        // Create subfolder record in database
        await FileMeta.create({
          path: subfolderPath,
          name: subfolderName,
          userId: userId || null,
          isFolder: true,
          contentType: "folder",
          size: 0,
          isPublic: false,
          fullPath: gcsFolderPath,
          folderType: specificFolderType,
          parentFolderId: parentFolderId,
          metadata: {
            orderId: orderId?.toString() || null,
            cpIds: normalizedCpIds,
            originalFolderType: 'postproduction', // Keep track of the parent type
            subfolderName: subfolderName
          }
        });
        console.log(`✅ Created database record for Post-Production subfolder: ${subfolderName}`);
      } else {
        console.log(`📁 Post-Production subfolder already exists in database: ${subfolderName}`);
      }
    } catch (error) {
      console.error(`❌ Error creating Post-Production subfolder ${subfolderName}:`, error);
      throw error;
    }
  }
};

/**
 * Create production workflow subfolders (Pre-Production, Post-Production with subfolders)
 * @param {string} parentPath - Parent folder path (without Website_Shoots_Flow/ prefix)
 * @param {ObjectId} parentFolderId - Parent folder's MongoDB _id
 * @param {Array} cpIds - Array of CP IDs
 * @param {string} orderId - Order ID
 * @param {string} userId - User/Client ID
 */
const createProductionSubfolders = async (parentPath, parentFolderId, cpIds, orderId, userId) => {
  // Create both Pre-Production and Post-Production folders (no production folder)
  // Map display names to internal database folderType values for permissions
  const subfolderConfig = [
    { displayName: 'Pre-Production', dbFolderType: 'preproduction' },
    { displayName: 'Post-Production', dbFolderType: 'postproduction' }
  ];

  // Normalize cpIds to simple string array
  const normalizedCpIds = cpIds ? cpIds.map((item) => {
    if (typeof item === 'string') return item;
    if (item && item.id) return item.id.toString();
    return item?.toString();
  }).filter(Boolean) : [];

  for (const { displayName, dbFolderType } of subfolderConfig) {
    const subfolderPath = `${parentPath.replace(/\/$/, '')}/${displayName}/`;
    const gcsFolderPath = `Website_Shoots_Flow/${subfolderPath}`;

    try {
      // Create folder in GCS
      const newFolder = bucket.file(gcsFolderPath);
      const [exists] = await newFolder.exists();

      if (!exists) {
        const options = {
          metadata: {
            metadata: {
              createdBy: JSON.stringify(normalizedCpIds),
              orderId: JSON.stringify(orderId),
              folderType: dbFolderType,
            },
          },
        };
        await newFolder.save("", options);
        console.log(`✅ Created GCS subfolder: ${gcsFolderPath}`);
      }

      // Check if subfolder already exists in database
      let existingSubfolder = await FileMeta.findOne({ path: subfolderPath });

      if (!existingSubfolder) {
        // Create subfolder record in database
        // Use dbFolderType (lowercase, no hyphen) for permissions compatibility
        const createdSubfolder = await FileMeta.create({
          path: subfolderPath,
          name: displayName,
          userId: userId || null,
          isFolder: true,
          contentType: "folder",
          size: 0,
          isPublic: false,
          fullPath: gcsFolderPath,
          folderType: dbFolderType,
          parentFolderId: parentFolderId,
          metadata: {
            orderId: orderId?.toString() || null,
            cpIds: normalizedCpIds
          }
        });
        console.log(`✅ Created database record for subfolder: ${displayName}`);

        // Create postproduction subfolders only for Post-Production folder
        if (dbFolderType === 'postproduction') {
          await createPostProductionSubfoldersOnly(
            subfolderPath,
            createdSubfolder._id,
            cpIds,
            orderId,
            userId
          );
          console.log('✅ Post-Production subfolders created successfully');
        }
      } else {
        console.log(`📁 Subfolder already exists in database: ${displayName}`);

        // If the Post-Production folder exists, make sure its subfolders are created
        if (dbFolderType === 'postproduction') {
          await createPostProductionSubfoldersOnly(
            subfolderPath,
            existingSubfolder._id,
            cpIds,
            orderId,
            userId
          );
          console.log('✅ Post-Production subfolders checked/created successfully');
        }
      }
    } catch (error) {
      console.error(`❌ Error creating subfolder ${displayName}:`, error);
      throw error;
    }
  }
};
const createChatFolder = async (folderName, cpIds, orderId) => {
  let options = {};

  if (cpIds?.length > 0 || orderId) {
    const idsArray = cpIds.filter((item) => item.id).map((item) => item.id);
    options = {
      metadata: {
        metadata: {
          createdBy: JSON.stringify([...idsArray]),
          orderId: JSON.stringify(orderId),
        },
      },
    };
  }

  // Check and create shoots folder if it doesn't exist
  const shootsFolder = bucket.file("chats/");
  const [shootsExists] = await shootsFolder.exists();
  if (!shootsExists) {
    await shootsFolder.save("");
  }

  // Create new folder inside shoots
  const folderPath = `chats/${folderName}`.replace(/\/+/g, "/");
  const newFolder = bucket.file(folderPath + "/");

  try {
    const [exists] = await newFolder.exists();

    if (exists) {
      return { error: "file-exists" }; // 409 conflict
    }
    // Save the folder with or without metadata based on cpIds
    await newFolder.save("", options);
    return { saved: true };
  } catch (error) {
    console.error("Error saving folder:", error);
    return { error: "save-error" };
  }
};

/**
 * Get files and folders for a user with role-based access control
 * 
 * IMPORTANT CP ACCESS LOGIC:
 * - CP users can ONLY see booking/order folders AFTER they have accepted the order
 * - When CP decision is "pending", "cancelled", or "booked", the folder remains hidden
 * - Only when CP decision is "accepted" will the folder become visible
 * - This prevents CPs from seeing order details before committing to the project
 * 
 * @param {String} userId - User ID to get files for
 * @param {String} role - User role (user, cp, admin, post_production_manager)
 * @param {String} path - Optional path to filter files (null = root level)
 * @returns {Object} Files and folders with access control applied
 */
const getFiles = async (userId, role, path = null) => {
  try {
    console.log('📂 ========== getFiles CALLED ==========');
    console.log('📂 Parameters:', { userId, role, path });

    // Determine if the user has admin privileges
    const isAdmin = role === "admin" || role === "post_production_manager";
    console.log('📂 isAdmin:', isAdmin);

    // Build query for database
    let query = {};

    // Helper function to escape special regex characters
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build path filter
    let pathFilter = {};
    if (path) {
      const decodedPath = decodeURIComponent(path);
      console.log('🔍 Decoded path for query:', decodedPath);
      // Escape special regex characters in the path
      const escapedPath = escapeRegex(decodedPath.replace(/\/$/, ''));
      console.log('🔍 Escaped path for regex:', escapedPath);
      // Get files directly in this folder (not nested)
      pathFilter.$or = [
        { path: new RegExp(`^${escapedPath}/[^/]+$`) }, // Files in this folder
        { path: new RegExp(`^${escapedPath}/[^/]+/$`) } // Subfolders in this folder
      ];
    } else {
      // Root level - get files that don't have nested paths
      console.log('🔍 Fetching root level files/folders');
      pathFilter.$or = [
        { path: /^[^/]+$/ },      // Files at root
        { path: /^[^/]+\/$/ }     // Folders at root
      ];
    }

    if (!isAdmin) {
      // Non-admin users can see:
      // 1. Files/folders where they are the owner (userId)
      // 2. For CP users: Folders where they have ACCEPTED the order (decision === "accepted")
      // 3. Files inside folders they have access to (checked via parent folder)
      // This allows both client (user) and CP to access order folders

      // Convert userId to string for consistent comparison
      // (cpIds are stored as strings in metadata)
      const userIdStr = userId?.toString();

      console.log('📂 Building user access filter for:', userIdStr);

      // NEW: For CP users, get list of orderIds where they have accepted
      let acceptedOrderIds = [];
      if (role === 'cp' && userId) {
        const Order = require('../models/order.model');
        const acceptedOrders = await Order.find({
          'cp_ids': {
            $elemMatch: {
              id: userId,
              decision: 'accepted'
            }
          }
        }).select('_id');
        
        acceptedOrderIds = acceptedOrders.map(order => order._id.toString());
        console.log('✅ CP has accepted these orders:', acceptedOrderIds);
      }

      // IMPORTANT: When browsing inside a folder (path is provided), check if user has
      // access to the ROOT folder of the order. If yes, they can see files inside
      // based on folder type visibility rules.
      let hasAccessToParentFolder = false;
      let rootFolderPath = null;

      if (path) {
        // Extract the root folder name (first segment of the path)
        const decodedPath = decodeURIComponent(path);
        const pathSegments = decodedPath.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
          rootFolderPath = pathSegments[0] + '/';
          console.log('📂 Checking access to root folder:', rootFolderPath);

          // Build access check query based on role
          let rootFolderQuery = {
            path: rootFolderPath,
            isFolder: true,
            $or: [
              { userId: userId }
            ]
          };

          // For CP: Only allow access if they have accepted the order
          if (role === 'cp' && acceptedOrderIds.length > 0) {
            rootFolderQuery.$or.push({
              'metadata.cpIds': userIdStr,
              'metadata.orderId': { $in: acceptedOrderIds }
            });
            rootFolderQuery.$or.push({
              'metadata.cpIds': userId,
              'metadata.orderId': { $in: acceptedOrderIds }
            });
          } else if (role !== 'cp') {
            // For non-CP users (clients), allow normal access
            rootFolderQuery.$or.push({ 'metadata.cpIds': userIdStr });
            rootFolderQuery.$or.push({ 'metadata.cpIds': userId });
          }

          // Check if user has access to the root folder
          const rootFolder = await FileMeta.findOne(rootFolderQuery);

          if (rootFolder) {
            hasAccessToParentFolder = true;
            console.log('✅ User has access to root folder:', rootFolderPath);
          } else {
            console.log('❌ User does NOT have access to root folder:', rootFolderPath);
          }
        }
      }

      if (hasAccessToParentFolder && path) {
        // User has access to the parent folder - show files based on path filter only
        // (folder type visibility filter will be applied later)
        console.log('📂 User has parent folder access - showing files in path');
        query = pathFilter;
      } else {
        // User is browsing root level OR doesn't have parent folder access
        // Apply strict user access filter
        let userAccessFilter = {
          $or: [
            { userId: userId }
          ]
        };

        // For CP users: Only show folders where they have ACCEPTED the order
        if (role === 'cp' && acceptedOrderIds.length > 0) {
          userAccessFilter.$or.push({
            'metadata.cpIds': userIdStr,
            'metadata.orderId': { $in: acceptedOrderIds }
          });
          userAccessFilter.$or.push({
            'metadata.cpIds': userId,
            'metadata.orderId': { $in: acceptedOrderIds }
          });
        } else if (role !== 'cp') {
          // For non-CP users (clients), allow normal cpIds access
          userAccessFilter.$or.push({ 'metadata.cpIds': userIdStr });
          userAccessFilter.$or.push({ 'metadata.cpIds': userId });
          // LEGACY: Object format for backward compatibility with old data
          userAccessFilter.$or.push({ 'metadata.cpIds.id': userIdStr });
          userAccessFilter.$or.push({ 'metadata.cpIds.id': userId });
          userAccessFilter.$or.push({ 'metadata.cpIds': { $elemMatch: { id: userIdStr } } });
          userAccessFilter.$or.push({ 'metadata.cpIds': { $elemMatch: { id: userId } } });
        }

        // Combine user access filter with path filter using $and
        query = {
          $and: [
            userAccessFilter,
            pathFilter
          ]
        };
      }

      console.log('🔍 Full query for user:', JSON.stringify(query, null, 2));

      // Debug: Also check if any folders have this CP's ID in metadata.cpIds
      const foldersWithThisCp = await FileMeta.find({
        isFolder: true,
        $or: [
          // NEW: Simple string array format
          { 'metadata.cpIds': userIdStr },
          // LEGACY: Object format
          { 'metadata.cpIds.id': userIdStr },
          { 'metadata.cpIds': { $elemMatch: { id: userIdStr } } }
        ]
      }).select('path metadata.cpIds metadata.orderId');
      console.log('📂 DEBUG - Folders with this CP ID in metadata:', foldersWithThisCp.map(f => ({
        path: f.path,
        cpIds: f.metadata?.cpIds,
        orderId: f.metadata?.orderId
      })));

    } else {
      // Admin can see all files, just apply path filter
      query = pathFilter;
    }

    // Apply folder type visibility filter based on role
    // NEW Permission Matrix (User role):
    // preproduction: View ✅, Upload ✅
    // postproduction: View ✅, Upload ❌
    // postproduction_raw_footage: View ❌ (HIDDEN), Upload ❌
    // postproduction_edited_footage: View ✅, Upload ❌
    // postproduction_final_deliverables: View ✅, Upload ❌
    let folderTypeFilter = null;

    if (role === 'user') {
      // Users can see: root, pre-production, post-production, edited footage, final deliverables
      // Users CANNOT see: raw footage (hidden)
      folderTypeFilter = {
        $or: [
          { folderType: null },
          { folderType: 'root' },
          { folderType: 'preproduction' },                    // User can VIEW and UPLOAD
          { folderType: 'postproduction' },                   // User can VIEW only
          { folderType: 'postproduction_edited_footage' },    // User can VIEW only
          { folderType: 'postproduction_final_deliverables' }, // User can VIEW only
          { folderType: { $exists: false } }
        ]
        // NOTE: postproduction_raw_footage is NOT included - hidden from users
      };
    } else if (role === 'cp') {
      // CPs can see: root folders, preproduction, postproduction folders, and their subfolders
      folderTypeFilter = {
        $or: [
          { folderType: null },
          { folderType: 'root' },
          { folderType: 'preproduction' },
          { folderType: 'postproduction' },
          { folderType: 'postproduction_raw_footage' },
          { folderType: 'postproduction_edited_footage' },
          { folderType: 'postproduction_final_deliverables' },
          { folderType: { $exists: false } }
        ]
      };
    }
    // Admin and PM can see all folder types (no filter needed)

    // Combine folder type filter with existing query
    if (folderTypeFilter) {
      query = {
        $and: [
          query,
          folderTypeFilter
        ]
      };
    }

    console.log('🔍 Executing query:', JSON.stringify(query, null, 2));

    const files = await FileMeta.find(query)
      .sort({ isFolder: -1, createdAt: -1 }) // Folders first, then by date
      .lean();

    console.log('✅ Found files in database:', files.length);
    console.log('📂 Requested path:', path || 'ROOT');
    if (files.length > 0) {
      console.log('📁 Files/folders found:', files.map(f => ({
        path: f.path,
        isFolder: f.isFolder,
        name: f.name,
        userId: f.userId,
        cpIds: f.metadata?.cpIds
      })));
    } else {
      console.log('⚠️ No files found for query. Checking raw data...');
      // Debug: Show all files at root level to see what exists
      const allRootFiles = await FileMeta.find({ path: /^[^/]+\/?$/ }).select('path userId metadata.cpIds isFolder').lean();
      console.log('📁 All root level files/folders:', allRootFiles.map(f => ({
        path: f.path,
        userId: f.userId?.toString(),
        cpIds: f.metadata?.cpIds,
        isFolder: f.isFolder
      })));
    }

    // Transform data to match frontend expectations
    const transformedFiles = files.map(file => {
      // Determine if current user is the owner
      const isOwner = file.userId?.toString() === userId?.toString();

      // Get all users who have access (owner + CPs)
      let createdByUsers = [file.userId];
      if (file.metadata?.cpIds && Array.isArray(file.metadata.cpIds)) {
        const cpIdsList = file.metadata.cpIds.map(cp => cp.id || cp).filter(Boolean);
        createdByUsers = [...new Set([...createdByUsers, ...cpIdsList])];
      }

      // Determine canUpload permission based on folder type and role
      // Permission Matrix (User role):
      // preproduction: Upload ✅
      // postproduction: Upload ❌
      // postproduction_raw_footage: Upload ❌ (hidden anyway)
      // postproduction_edited_footage: Upload ❌
      // postproduction_final_deliverables: Upload ❌
      let canUpload = true; // Default to true
      const folderType = file.folderType || null;

      if (isAdmin || role === 'pm') {
        // Admin and PM can always upload
        canUpload = true;
      } else if (role === 'user') {
        // Users can ONLY upload to Pre-Production folder
        if (folderType === 'preproduction') {
          canUpload = true;
        } else if (folderType === 'postproduction' ||
                   folderType === 'postproduction_edited_footage' ||
                   folderType === 'postproduction_final_deliverables') {
          canUpload = false; // View only for users
        } else if (folderType === 'root' || folderType === null) {
          canUpload = true; // Allow upload to root folder
        } else {
          canUpload = false;
        }
      } else if (role === 'cp') {
        // CPs can upload to raw footage and edited footage, but NOT to pre-production and final deliverables
        if (folderType === 'preproduction' || folderType === 'postproduction_final_deliverables') {
          canUpload = false;
        } else if (folderType === 'postproduction_raw_footage' || folderType === 'postproduction_edited_footage') {
          canUpload = true;
        } else {
          canUpload = true; // Allow upload to root and other folders
        }
      }

      return {
        id: file._id.toString(),
        path: file.path,
        name: file.name || file.path.split('/').filter(Boolean).pop(),
        size: file.size || 0,
        contentType: file.contentType || (file.isFolder ? 'folder' : 'application/octet-stream'),
        isFolder: file.isFolder || file.path.endsWith('/'),
        updated: file.updatedAt || file.createdAt,
        created: file.createdAt,
        userId: file.userId,
        version: file.version || file._id.toString(),
        downloadLink: file.isPublic ? `https://storage.googleapis.com/${bucket.name}/Website_Shoots_Flow/${file.path}` : null,
        isPublic: file.isPublic || false,
        author: file.author || 'Unknown',
        url: `https://storage.googleapis.com/${bucket.name}/Website_Shoots_Flow/${file.path}`,
        fullPath: file.fullPath || `Website_Shoots_Flow/${file.path}`,
        // Legacy fields for compatibility
        cacheControl: '',
        contentEncoding: '',
        formattedSize: formatFileSize(file.size || 0),
        createdBy: createdByUsers,
        orderId: file.metadata?.orderId || null,
        cpIds: file.metadata?.cpIds || [],
        isOwner: isOwner,
        // NEW: Permission fields for frontend
        folderType: folderType,
        canUpload: canUpload
      };
    });

    return {
      bucket: bucket.name,
      files: transformedFiles,
      totalFiles: transformedFiles.length,
      success: true,
      path: path || ''
    };
  } catch (error) {
    console.error("❌ Error fetching files:", error);
    return {
      success: false,
      error: "Failed to fetch files",
      details: error.message,
    };
  }
};

// Helper function to format file size
const formatFileSize = (sizeInBytes) => {
  if (sizeInBytes === 0) return "0 B";
  if (sizeInBytes < 1024) return sizeInBytes + " B";
  if (sizeInBytes < 1024 * 1024) return (sizeInBytes / 1024).toFixed(2) + " KB";
  return (sizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
};

const getChatFiles = async (folderPath) => {
  try {
    const normalizedPath = folderPath.startsWith("chats/")
      ? folderPath
      : `chats/${folderPath}`;

    const [files] = await bucket.getFiles({
      prefix: normalizedPath,
      autoPaginate: false,
    });

    // Filter out the folder itself and empty entries
    const actualFiles = files.filter(
      (file) => file.name !== normalizedPath + "/" && !file.name.endsWith("/")
    );

    if (actualFiles.length === 0) {
      return { error: "no-files-found" };
    }

    const filesList = actualFiles.map((file) => ({
      name: file.name,
      url: `https://storage.googleapis.com/${bucket.name}/${encodeUrlPath(
        file.name
      )}`,
      contentType: file.metadata.contentType || "",
      size: file.metadata.size || "0",
      created: file.metadata.timeCreated,
      updated: file.metadata.updated,
      downloadUrl: file.metadata.mediaLink,
    }));

    return {
      success: true,
      path: normalizedPath,
      totalFiles: filesList.length,
      files: filesList,
    };
  } catch (error) {
    console.error("Error getting chat folder files:", error);
    return { error: "fetch-error" };
  }
};

const downloadFiles = async (filePath, download) => {
  try {
    const file = bucket.file(filePath);

    // Check if file exists before generating signed URL
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`❌ File not found in GCS: ${filePath}`);
      // Log available files in the parent directory for debugging
      const pathParts = filePath.split('/');
      const parentPath = pathParts.slice(0, -1).join('/') + '/';
      const [files] = await bucket.getFiles({ prefix: parentPath, maxResults: 10 });
      console.log('📂 Available files in parent directory:');
      files.forEach(f => console.log('  -', f.name));
      throw new Error(`File not found: ${filePath}`);
    }

    // Google Cloud Storage v4 signed URLs have a maximum expiration of 7 days
    const MAX_EXPIRY_DAYS = 7;

    // Calculate expiry duration in days, ensuring it doesn't exceed the maximum
    let expiryDays = download ? 1 / 24 : Math.min(PRIVATE_URL_EXPIRY_DAYS, MAX_EXPIRY_DAYS);

    // Calculate expiry date by adding milliseconds (more reliable than setDate)
    // 1 day = 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
    const expiryMilliseconds = expiryDays * 24 * 60 * 60 * 1000;
    const expiryDate = new Date(Date.now() + expiryMilliseconds);

    console.log(`⏰ Generating signed URL with ${expiryDays} day(s) expiration`);

    const [url] = await file.getSignedUrl({
      version: "v4", // Use v4 for better encoding support
      action: "read",
      expires: expiryDate,
      cname: download ? null : CDN_URL,
      promptSaveAs: download
        ? filePath.split("/")[filePath.split("/").length - 1]
        : null,
    });

    console.log(`✅ Generated signed URL for: ${filePath} (expires in ${expiryDays} days)`);
    return { url, duration: expiryDays };
  } catch (error) {
    console.error(`❌ Error generating signed URL for ${filePath}:`, error.message);
    throw error;
  }
};

const uploadFile = async (
  filePath,
  fileContentType,
  fileSize,
  userId = null,
  metadata = {}
) => {
  await setBucketCors(); // Make sure bucket cors policy is set to allow access from file manager

  const newFile = bucket.file(filePath);
  const expDate = Date.now() + 60 * 60 * 1000; // Allow 60 minutes for upload

  // Extract folder path from file path
  const lastSlashIndex = filePath.lastIndexOf('/');
  const folderPath = lastSlashIndex !== -1 ? filePath.substring(0, lastSlashIndex + 1) : '';
  
  // Initialize array of user IDs with the provided userId (if any)
  let userIds = userId ? [userId] : []; // Client Id added here
  
  // If this file is in a folder, read cached folder metadata for createdBy users
  // to avoid repeated GCS metadata calls during large multi-file uploads.
  if (folderPath) {
    try {
      const folderCreatedBy = await getCachedFolderCreatedByUsers(folderPath);
      if (folderCreatedBy.length) {
        userIds = [...new Set([...userIds, ...folderCreatedBy])];
      }
    } catch (e) {
      console.error('Error getting folder metadata:', e);
    }
  }
  
  // Prepare metadata with user IDs - store as direct array, not as JSON string
  // This ensures consistent format between storage and retrieval
  let fileMetadata = {};
  if (userIds.length > 0) {
    fileMetadata = {
      metadata: {
        createdBy: userIds, // Store as direct array, not JSON string
        ...metadata,
      },
    };
  }

  const options = {
    expires: expDate,
    conditions: [
      ["eq", "$Content-Type", fileContentType],
      ["content-length-range", 0, fileSize + 1024],
    ],
    fields: {
      success_action_status: "201",
      "Content-Type": fileContentType,
    }
  };
  
  // Generate the signed URL for upload
  const [response] = await newFile.generateSignedPostPolicyV4(options);
  
  // After upload is complete, we need to set the metadata separately
  // Create a function to set metadata after upload
  const setMetadataAfterUpload = async () => {
    try {
      // Try multiple times with increasing delays
      const maxRetries = 5;
      let retryCount = 0;
      let success = false;
      
      while (retryCount < maxRetries && !success) {
        try {
          // Increase wait time with each retry
          const waitTime = 2000 + (retryCount * 2000); // 2s, 4s, 6s, 8s, 10s
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // Check if file exists
          const [exists] = await newFile.exists();
          if (exists && userIds.length > 0) {
            // Set metadata on the file
            // For Google Cloud Storage, metadata needs to be stored as strings
            const metadataToSet = {
              metadata: {
                createdBy: JSON.stringify(userIds.map(id => id.toString())),
                ...metadata
              }
            };
            
            await newFile.setMetadata(metadataToSet);
            
            // Verify metadata was set correctly
            const [updatedMetadata] = await newFile.getMetadata();
            
            if (updatedMetadata.metadata && updatedMetadata.metadata.createdBy) {
              try {
                const savedCreatedBy = JSON.parse(updatedMetadata.metadata.createdBy);
                
                // Check if at least one of our user IDs is in the saved createdBy array
                const hasUserIds = userIds.some(id => 
                  savedCreatedBy.includes(id.toString())
                );
                
                if (hasUserIds) {
                  success = true;
                }
              } catch (parseError) {
                // Continue to next attempt if parsing fails
              }
            }
          }
        } catch (err) {
          // Skip this attempt and try again
        }
        
        retryCount++;
      }
    } catch (error) {
      // Silently fail - we don't want to block the upload process
      // if metadata setting fails
    }
  };
  
  // Start the metadata setting process without waiting for it
  // This allows us to return the upload URL immediately
  setMetadataAfterUpload();
    return {
      url: response.url,
      fields: response.fields,
      filePath: filePath,
      success: true,
    };
  // } catch (error) {
  //   console.error("Error generating upload URL:", error);
  //   return {
  //     success: false,
  //     error: "Failed to generate upload URL",
  //     details: error.message,
  //   };
  // }
};

const deleteFile = async (filepath) => {
  try {
    console.log('🔍 deleteFile called with filepath:', filepath);

    // List files under the specified path
    const [files] = await bucket.getFiles({ prefix: filepath });
    console.log(`🗑️ Found ${files.length} files in GCS to delete`);

    // Delete each file from GCS
    await Promise.all(files.map((file) => file.delete()));

    // Remove corresponding records from the database
    // Convert GCS path to database path format (remove 'Website_Shoots_Flow/' or 'shoots/' prefix if present)
    let dbPath = filepath;
    if (filepath.startsWith('Website_Shoots_Flow/')) {
      dbPath = filepath.substring(20); // Remove 'Website_Shoots_Flow/' prefix (20 chars)
      console.log('✂️ Removed Website_Shoots_Flow/ prefix, dbPath is now:', dbPath);
    } else if (filepath.startsWith('shoots/')) {
      dbPath = filepath.substring(7); // Remove 'shoots/' prefix (7 chars)
      console.log('✂️ Removed shoots/ prefix, dbPath is now:', dbPath);
    }

    // For folders, we need to handle both the folder entry and all files within it
    const { FileMeta } = require("../models");

    // Create patterns to match the folder and all its contents
    // For a folder like "User's shoot-raw_ed4c1/test folder/", we want to match:
    // 1. The folder itself: "User's shoot-raw_ed4c1/test folder/" (with slash)
    // 2. The folder without slash: "User's shoot-raw_ed4c1/test folder" (sometimes stored without slash)
    // 3. All files/subfolders within it: "User's shoot-raw_ed4c1/test folder/*"
    const pathWithSlash = dbPath.endsWith('/') ? dbPath : dbPath + '/';
    const pathWithoutSlash = dbPath.endsWith('/') ? dbPath.slice(0, -1) : dbPath;

    // Escape special regex characters in the path for the pattern
    const escapedPath = pathWithoutSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = new RegExp(`^${escapedPath}/`);

    console.log('🔍 Database deletion patterns:');
    console.log('  - pathWithSlash:', pathWithSlash);
    console.log('  - pathWithoutSlash:', pathWithoutSlash);
    console.log('  - regexPattern:', regexPattern.toString());

    // First, let's see what matches our query before deletion
    const existingRecords = await FileMeta.find({
      $or: [
        { path: pathWithSlash },       // Folder with trailing slash
        { path: pathWithoutSlash },    // Folder without trailing slash (if stored differently)
        { path: regexPattern }         // All items inside the folder
      ]
    });

    console.log(`🔍 Found ${existingRecords.length} records to delete from database:`);
    existingRecords.forEach((record, index) => {
      console.log(`  ${index + 1}. Path: "${record.path}", Name: "${record.name}", IsFolder: ${record.isFolder}`);
    });

    // Delete from database - handle both the folder itself and all contents within it
    const deleteResult = await FileMeta.deleteMany({
      $or: [
        { path: pathWithSlash },       // Folder with trailing slash
        { path: pathWithoutSlash },    // Folder without trailing slash (if stored differently)
        { path: regexPattern }         // All items inside the folder
      ]
    });

    console.log(`✅ Database deletion result: ${deleteResult.deletedCount} documents deleted`);

    return { deleted: true, deletedCount: deleteResult.deletedCount };
  } catch (error) {
    console.error('❌ Error in deleteFile:', error);
    throw error;
  }
};

const updateGcpFolderMetadata = async (folderName, AddedUserId, orderId) => {
  console.log('🔄 ========== updateGcpFolderMetadata CALLED ==========');
  console.log('📋 Input parameters:', {
    folderName,
    AddedUserId,
    orderId
  });

  const Order = require("../models/order.model");
  const order = await Order.findById(orderId);

  if (!order) {
    console.error('❌ Order not found for metadata update:', orderId);
    return { error: "order-not-found" };
  }

  console.log('📦 Order found:', {
    orderId: order._id,
    orderName: order.order_name,
    filePath: order.file_path,
    clientId: order.client_id
  });

  // IMPORTANT: Use the stored folder path from order.file_path.dir_name if available
  // This ensures we find the exact folder that was created, regardless of how the name was constructed
  let file_path;

  if (order.file_path && order.file_path.dir_name) {
    // Use the stored folder path - most reliable method
    file_path = order.file_path.dir_name;
    console.log('📁 Using stored folder path from order:', file_path);
  } else {
    // Fallback: reconstruct the folder path (may not match if naming conventions changed)
    const inCluededOrderId = getLastFiveChars(orderId);

    // Get user name for folder naming (use guest name if no client_id)
    let userName = "User";
    if (order.client_id) {
      try {
        const userService = require("./user.service");
        const client = await userService.getUserById(order.client_id);
        if (client && client.name) {
          userName = client.name.split(' ')[0]; // First name only
        }
      } catch (error) {
        console.error("Error fetching client name for folder:", error.message);
      }
    } else if (order.guest_info?.name) {
      userName = order.guest_info.name.split(' ')[0]; // First name only
    }

    // Get service type for folder naming
    const serviceType = order.service_type || order.content_vertical || "Photography";

    // Create the folder path
    file_path = `${userName}'s ${serviceType}_${inCluededOrderId}`;
    console.log('📁 Reconstructed folder path (fallback):', file_path);
  }

  const folder = bucket.file(`Website_Shoots_Flow/${file_path}/`);

  try {
    // Check if the folder exists
    const [exists] = await folder.exists();
    if (!exists) {
      return { error: "folder-not-found" };
    }

    const [metadata] = await folder.getMetadata();
    let currentCpIds = [];
    if (metadata.metadata && metadata.metadata.createdBy) {
      try {
        currentCpIds = JSON.parse(metadata.metadata.createdBy);
      } catch (e) {
        console.error("Error parsing current createdBy metadata:", e);
      }
    }
    // Update cpIds
    const updatedCpIds = [...new Set([...currentCpIds, AddedUserId])];
    // Preserve existing metadata and update createdBy
    const updatedMetadata = {
      ...metadata.metadata,
      createdBy: JSON.stringify(updatedCpIds),
      orderId: JSON.stringify(orderId),
    };

    const options = {
      metadata: updatedMetadata,
    };

    await folder.setMetadata(options);

    // Also update the database record to ensure access control works
    const { FileMeta } = require("../models");
    const pathWithoutPrefix = file_path + "/";

    console.log('📁 ========== FileMeta Database Update ==========');
    console.log('📁 Looking for folder in database with path:', pathWithoutPrefix);
    console.log('📁 Also trying without trailing slash:', file_path);

    // Debug: List all FileMeta folders to see what exists
    const allFolders = await FileMeta.find({ isFolder: true }).select('path metadata.orderId metadata.cpIds userId').limit(20);
    console.log('📁 All existing folders in database (first 20):', allFolders.map(f => ({
      path: f.path,
      orderId: f.metadata?.orderId,
      cpIds: f.metadata?.cpIds,
      userId: f.userId
    })));

    // Try multiple path formats to find the folder
    let folderRecord = await FileMeta.findOne({ path: pathWithoutPrefix });

    // If not found with trailing slash, try without
    if (!folderRecord) {
      folderRecord = await FileMeta.findOne({ path: file_path });
    }

    // If still not found, try to find by orderId in metadata
    if (!folderRecord) {
      folderRecord = await FileMeta.findOne({
        'metadata.orderId': orderId,
        isFolder: true
      });
    }

    if (folderRecord) {
      console.log('📁 ✅ Found folder record:', {
        id: folderRecord._id,
        path: folderRecord.path,
        userId: folderRecord.userId,
        existingMetadata: folderRecord.metadata
      });

      const addedUserIdStr = AddedUserId?.toString();

      // Get existing cpIds and normalize to simple string array for reliable querying
      const existingCpIds = folderRecord.metadata?.cpIds || [];
      // Convert any object format {id: 'xxx'} to just 'xxx' strings
      const normalizedCpIds = existingCpIds.map(cp => {
        if (typeof cp === 'string') return cp;
        if (cp && cp.id) return cp.id.toString();
        return cp?.toString();
      }).filter(Boolean);

      console.log('📁 Checking if CP exists:', {
        addedUserIdStr,
        normalizedCpIds: JSON.stringify(normalizedCpIds)
      });

      const cpIdExists = normalizedCpIds.includes(addedUserIdStr);

      // Always normalize and update cpIds to ensure consistent string format for queries
      // This fixes issues where cpIds are stored as objects with ObjectId but queries expect strings
      const updatedCpIds = cpIdExists
        ? normalizedCpIds  // CP exists, just normalize format
        : [...normalizedCpIds, addedUserIdStr];  // Add new CP

      console.log('📁 Updating folder metadata with normalized cpIds:', {
        cpIdExists,
        normalizedCpIds,
        updatedCpIds
      });

      // Use findOneAndUpdate with $set for atomic update
      const updatedFolder = await FileMeta.findOneAndUpdate(
        { _id: folderRecord._id },
        {
          $set: {
            'metadata.cpIds': updatedCpIds,  // Simple string array for reliable querying
            'metadata.orderId': orderId?.toString()  // Store as string for consistency
          }
        },
        { new: true } // Return the updated document
      );

      console.log('✅ ATOMIC UPDATE RESULT:', {
        id: updatedFolder?._id,
        path: updatedFolder?.path,
        newCpIds: updatedFolder?.metadata?.cpIds,
        newOrderId: updatedFolder?.metadata?.orderId
      });

      if (updatedFolder) {
        console.log('✅ Database metadata updated for folder:', updatedFolder._id, cpIdExists ? '(normalized format)' : 'added CP:', addedUserIdStr);
      } else {
        console.error('❌ Atomic update returned null - folder not updated');
      }

      // CRITICAL FIX: Update all FILES inside this folder to include the CP in their metadata
      // This ensures that files uploaded BEFORE the CP accepted the order are now accessible to the CP
      try {
        console.log('📝 Updating all files in folder to add CP access...');
        console.log('📁 Folder path being searched:', pathWithoutPrefix);

        // FIX: Try multiple path patterns to find files
        // Files might be stored with different path prefixes
        const basePattern = pathWithoutPrefix.replace(/\/$/, '');
        const searchPatterns = [
          new RegExp(`^${basePattern}/`),           // User's shoot-raw_7193d/file.jpg
          new RegExp(`^Website_Shoots_Flow/${basePattern}/`),    // Website_Shoots_Flow/User's shoot-raw_7193d/file.jpg
          new RegExp(`${basePattern}/`)             // Contains pattern (fallback)
        ];

        console.log('🔍 Search patterns for files:', searchPatterns.map(p => p.source));

        // Try each pattern until we find files
        let filesInFolder = [];
        for (const pattern of searchPatterns) {
          filesInFolder = await FileMeta.find({
            path: pattern,
            isFolder: { $ne: true } // Only files, not subfolders
          });
          
          if (filesInFolder.length > 0) {
            console.log(`✅ Found ${filesInFolder.length} files with pattern: ${pattern.source}`);
            break;
          }
        }

        console.log(`📂 Found ${filesInFolder.length} files in folder to update`);
        if (filesInFolder.length > 0) {
          console.log('📄 Sample file paths:', filesInFolder.slice(0, 3).map(f => f.path));
        }

        // Update each file to include the new CP ID using atomic operations
        let updatedFilesCount = 0;
        for (const file of filesInFolder) {
          const fileExistingCpIds = file.metadata?.cpIds || [];
          const cpExistsInFile = fileExistingCpIds.some(cp => {
            const cpIdStr = (cp.id || cp)?.toString();
            return cpIdStr === addedUserIdStr;
          });

          if (!cpExistsInFile) {
            // Use atomic update for files as well
            const updatedCpIds = [...fileExistingCpIds, { id: addedUserIdStr }];
            await FileMeta.findOneAndUpdate(
              { _id: file._id },
              {
                $set: {
                  'metadata.cpIds': updatedCpIds,
                  'metadata.orderId': orderId
                }
              }
            );
            updatedFilesCount++;
          }
        }

        console.log(`✅ Updated ${updatedFilesCount} files with CP access`);
      } catch (fileUpdateError) {
        console.error('❌ Error updating files in folder:', fileUpdateError.message);
        // Don't fail the whole operation if file update fails
      }

      // FINAL VERIFICATION: Confirm CP can now access this folder
      const verifyAccessQuery = await FileMeta.findOne({
        _id: folderRecord._id,
        $or: [
          // NEW: Simple string array format (current storage)
          { 'metadata.cpIds': addedUserIdStr },
          // LEGACY: Object format for backward compatibility
          { 'metadata.cpIds.id': addedUserIdStr },
          { 'metadata.cpIds': { $elemMatch: { id: addedUserIdStr } } }
        ]
      });

      if (verifyAccessQuery) {
        console.log('✅ FINAL VERIFICATION: CP can now access folder:', {
          folderId: verifyAccessQuery._id,
          folderPath: verifyAccessQuery.path,
          cpIdInMetadata: addedUserIdStr,
          allCpIds: verifyAccessQuery.metadata?.cpIds
        });
      } else {
        console.error('❌ FINAL VERIFICATION FAILED: CP cannot access folder after update!', {
          folderId: folderRecord._id,
          cpId: addedUserIdStr
        });
        // Try direct database query to see current state
        const currentState = await FileMeta.findById(folderRecord._id);
        console.error('❌ Current folder state:', {
          metadata: currentState?.metadata
        });
      }
    } else {
      console.log('⚠️ Folder record not found in database for path:', pathWithoutPrefix);

      // Create the FileMeta record if it doesn't exist
      try {
        const newFolderRecord = await FileMeta.create({
          path: pathWithoutPrefix,
          name: file_path.split('/').pop() || file_path,
          userId: order.client_id,
          isFolder: true,
          contentType: 'folder',
          size: 0,
          isPublic: false,
          fullPath: `Website_Shoots_Flow/${pathWithoutPrefix}`,
          metadata: {
            cpIds: [{ id: AddedUserId?.toString() }],
            orderId: orderId
          }
        });
        console.log('✅ Created new folder record in database:', newFolderRecord._id);
      } catch (createError) {
        console.error('❌ Failed to create folder record:', createError.message);
      }
    }

    return { updated: true };
  } catch (error) {
    console.error('Error in updateGcpFolderMetadata:', error);
    return { error: "update-error" };
  }
};

//
const removeCpFromMetadata = async (folderName, cpIdToRemove, orderId) => {
  const Order = require("../models/order.model");
  const order = await Order.findById(orderId);

  if (!order) {
    console.error('❌ Order not found for CP removal:', orderId);
    return { error: "order-not-found" };
  }

  // IMPORTANT: Use the stored folder path from order.file_path.dir_name if available
  let file_path;

  if (order.file_path && order.file_path.dir_name) {
    file_path = order.file_path.dir_name;
    console.log('📁 Using stored folder path for CP removal:', file_path);
  } else {
    // Fallback: reconstruct the folder path
    const inCluededOrderId = getLastFiveChars(orderId);

    let userName = "User";
    if (order.client_id) {
      try {
        const userService = require("./user.service");
        const client = await userService.getUserById(order.client_id);
        if (client && client.name) {
          userName = client.name.split(' ')[0];
        }
      } catch (error) {
        console.error("Error fetching client name for folder:", error.message);
      }
    } else if (order.guest_info?.name) {
      userName = order.guest_info.name.split(' ')[0];
    }

    const serviceType = order.service_type || order.content_vertical || "Photography";
    file_path = `${userName}'s ${serviceType}_${inCluededOrderId}`;
    console.log('📁 Reconstructed folder path for CP removal:', file_path);
  }

  const folder = bucket.file(`Website_Shoots_Flow/${file_path}/`);

  try {
    // Check if the folder exists
    const [exists] = await folder.exists();
    if (!exists) {
      return { error: "folder-not-found" };
    }

    const [metadata] = await folder.getMetadata();
    let currentCpIds = [];
    if (metadata.metadata && metadata.metadata.createdBy) {
      try {
        currentCpIds = JSON.parse(metadata.metadata.createdBy);
      } catch (e) {
        console.error("Error parsing current createdBy metadata:", e);
      }
    }

    // Remove the CP from the current list
    const updatedCpIds = currentCpIds.filter((cpId) => cpId !== cpIdToRemove);

    // Preserve existing metadata and update createdBy
    const updatedMetadata = {
      ...metadata.metadata,
      createdBy: JSON.stringify(updatedCpIds),
      orderId: JSON.stringify(orderId),
    };

    const options = {
      metadata: updatedMetadata,
    };

    await folder.setMetadata(options);

    // Also update the database record to ensure access control works
    const { FileMeta } = require("../models");
    const pathWithoutPrefix = file_path + "/";
    const folderRecord = await FileMeta.findOne({ path: pathWithoutPrefix });

    if (folderRecord) {
      // Remove the CP ID from the database metadata
      if (folderRecord.metadata && folderRecord.metadata.cpIds) {
        const existingCpIds = folderRecord.metadata.cpIds || [];
        folderRecord.metadata.cpIds = existingCpIds.filter(cp => cp.id !== cpIdToRemove);
        await folderRecord.save();
        console.log('✅ Database metadata updated (CP removed) for folder:', folderRecord._id);
      }
    }

    return { updated: true };
  } catch (error) {
    return { error: "update-error" };
  }
};
/**
 * Get all content for a specific user using the fixed folder path
 * @param {string} userId - The ID of the user
 * @returns {Promise<Object>} - Object containing file URLs
 */
const getCpsContent = async (userId) => {
  // Use the fixed folder path we established for uploads
  const folderPath = `ProfileInfo/${userId}/Images/cp-content`;

  try {
    // Get all files in the folder
    const [files] = await bucket.getFiles({ prefix: folderPath });
    
    // Generate public URLs for each file
    const fileUrls = files.map(file => {
      return {
        name: file.name.split('/').pop(), // Extract just the filename
        url: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
        uploadedAt: file.metadata?.timeCreated || null,
        size: parseInt(file.metadata?.size) || 0,
        contentType: file.metadata?.contentType || 'application/octet-stream'
      };
    });

    // Sort files by upload date (newest first)
    fileUrls.sort((a, b) => {
      if (!a.uploadedAt || !b.uploadedAt) return 0;
      return new Date(b.uploadedAt) - new Date(a.uploadedAt);
    });

    return { 
      success: true,
      files: fileUrls,
      count: fileUrls.length
    };
  } catch (error) {
    console.error("Error fetching files:", error);
    return { 
      success: false, 
      error: "Failed to fetch files",
      message: error.message
    };
  }
};
/**
 * Get content from the cp-content folder for a specific user
 * @param {string} userId - The ID of the user
 * @returns {Promise<Object>} - Object containing file URLs
 */
const getCpContent = async (userId) => {
  // Use the fixed folder path for cp-content
  const folderPath = `ProfileInfo/${userId}/cp-content`;

  try {
    // Get all files in the folder
    const [files] = await bucket.getFiles({ prefix: folderPath });
    
    // Generate public URLs for each file
    const fileUrls = files.map(file => {
      return {
        name: file.name.split('/').pop(), // Extract just the filename
        url: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
        uploadedAt: file.metadata?.timeCreated || null,
        size: parseInt(file.metadata?.size) || 0,
        contentType: file.metadata?.contentType || 'application/octet-stream'
      };
    });

    // Sort files by upload date (newest first)
    fileUrls.sort((a, b) => {
      if (!a.uploadedAt || !b.uploadedAt) return 0;
      return new Date(b.uploadedAt) - new Date(a.uploadedAt);
    });

    return { 
      success: true,
      files: fileUrls,
      count: fileUrls.length
    };
  } catch (error) {
    console.error("Error fetching cp-content files:", error);
    return { 
      success: false, 
      error: "Failed to fetch files",
      message: error.message
    };
  }
};

const deleteCpsContent = (fileUrls) => {
  return Promise.all(
    fileUrls.map((fileUrl) => {
      // Extract the file path from the full URL
      const filePath = fileUrl.replace(
        `https://storage.googleapis.com/${bucket.name}/`,
        ""
      );
      return bucket.file(filePath).delete();
    })
  );
};

/**
 * Get the 10 most recently uploaded files with comprehensive metadata including user details
 * @param {string} userId - Optional user ID to filter files by creator
 * @returns {Promise<Array>} Array of file objects with detailed metadata and user information
 */
const getRecentFiles = async (userId = null) => {
  try {
    // Get all files from the Website_Shoots_Flow directory
    const [files] = await bucket.getFiles({ prefix: "Website_Shoots_Flow/" });

    // Sort files by last modified time (newest first)
    const sortedFiles = files
      .filter((file) => !file.name.endsWith("/")) // Filter out folders
      .sort((a, b) => {
        // Sort by updated time if available, otherwise by creation time
        const timeA = new Date(a.metadata.updated || a.metadata.timeCreated);
        const timeB = new Date(b.metadata.updated || b.metadata.timeCreated);
        return timeB - timeA; // Sort in descending order (newest first)
      });

    // If userId is provided, we'll need to filter files after getting their metadata
    // We'll collect all files first, then filter and take the top 10
    let filesToProcess = sortedFiles;

    // Format the response with comprehensive metadata
    const allFormattedFiles = await Promise.all(
      filesToProcess.map(async (file) => {
        // Get full metadata for each file
        const [metadata] = await file.getMetadata();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

        // Format file size in a human-readable format
        const sizeInBytes = parseInt(metadata.size || 0, 10);
        let formattedSize = sizeInBytes + " B";
        if (sizeInBytes >= 1024) {
          formattedSize = (sizeInBytes / 1024).toFixed(2) + " KB";
        }
        if (sizeInBytes >= 1024 * 1024) {
          formattedSize = (sizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
        }

        // Format dates in a readable format
        const createdDate = new Date(metadata.timeCreated);
        const updatedDate = metadata.updated
          ? new Date(metadata.updated)
          : null;

        // Extract user IDs from createdBy metadata
        let createdByUserIds = [];
        let parentFolderMetadata = null;

        // If this is a file inside a folder, we need to get the folder's metadata
        // since user IDs are typically stored at the folder level
        const filePath = file.name;
        const folderPath = filePath.substring(0, filePath.lastIndexOf("/") + 1);

        // First check if the file itself has createdBy metadata
        if (metadata.metadata && metadata.metadata.createdBy) {
          try {
            console.log('File metadata.createdBy raw value:', metadata.metadata.createdBy);
            
            // Handle different formats of createdBy metadata
            if (typeof metadata.metadata.createdBy === 'string') {
              try {
                // Try to parse as JSON first
                createdByUserIds = JSON.parse(metadata.metadata.createdBy);
                console.log('Successfully parsed createdBy as JSON:', createdByUserIds);
              } catch (parseError) {
                // If parsing fails, treat as a single string ID
                console.log('createdBy is a string but not JSON, using as single ID');
                createdByUserIds = [metadata.metadata.createdBy];
              }
            } else if (Array.isArray(metadata.metadata.createdBy)) {
              // If it's already an array, use it directly
              console.log('createdBy is already an array');
              createdByUserIds = metadata.metadata.createdBy;
            }
            
            // Ensure it's an array at this point
            if (!Array.isArray(createdByUserIds)) {
              console.log('createdBy is not an array after processing, converting to empty array');
              createdByUserIds = [];
            }
          } catch (e) {
            console.error("Error processing file createdBy metadata:", e);
            createdByUserIds = [];
          }
        } else {
          console.log('No createdBy metadata found for file:', filePath);
        }

        // If no user IDs found in the file, try to get them from the parent folder
        if (createdByUserIds.length === 0 && folderPath !== filePath) {
          try {
            const folder = bucket.file(folderPath);
            const [folderExists] = await folder.exists();

            if (folderExists) {
              const [folderMetadata] = await folder.getMetadata();
              parentFolderMetadata = folderMetadata;

              if (
                folderMetadata.metadata &&
                folderMetadata.metadata.createdBy
              ) {
                try {
                  const folderCreatedBy = JSON.parse(
                    folderMetadata.metadata.createdBy
                  );
                  // If it's a string but not an array, convert to array
                  if (Array.isArray(folderCreatedBy)) {
                    createdByUserIds = folderCreatedBy;
                  } else if (typeof folderCreatedBy === "string") {
                    createdByUserIds = [folderCreatedBy];
                  }
                } catch (e) {
                  console.error("Error parsing folder createdBy metadata:", e);
                }
              }
            }
          } catch (e) {
            console.error("Error getting folder metadata:", e);
          }
        }

        // Extract order ID if available
        let orderId = null;
        // First check file metadata
        if (metadata.metadata && metadata.metadata.orderId) {
          try {
            orderId = JSON.parse(metadata.metadata.orderId);
          } catch (e) {
            console.error("Error parsing file orderId metadata:", e);
          }
        }

        // If no order ID found in file, check parent folder metadata
        if (
          !orderId &&
          parentFolderMetadata &&
          parentFolderMetadata.metadata &&
          parentFolderMetadata.metadata.orderId
        ) {
          try {
            orderId = JSON.parse(parentFolderMetadata.metadata.orderId);
          } catch (e) {
            console.error("Error parsing folder orderId metadata:", e);
          }
        }

        // Fetch user details for each creator ID
        const userDetails = await Promise.all(
          createdByUserIds.map(async (userId) => {
            try {
              // Get user information from the database
              const user = await userService.getUserById(userId);

              if (user) {
                return {
                  userId: user._id.toString(),
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  profilePicture: user.profile_picture || null,
                };
              }
              return null;
            } catch (error) {
              console.error(
                `Error fetching user details for ID ${userId}:`,
                error
              );
              return null;
            }
          })
        );

        // Filter out null values (users not found)
        const validUserDetails = userDetails.filter((user) => user !== null);

        return {
          name: file.name.split("/").pop(), // Get just the filename
          path: file.name, // Full path in storage
          fullPath: `https://storage.googleapis.com/${bucket.name}/${file.name}`, // Full URL path
          size: {
            bytes: sizeInBytes,
            formatted: formattedSize,
          },
          contentType: metadata.contentType,
          dates: {
            created: {
              raw: metadata.timeCreated,
              formatted: createdDate.toLocaleString(),
            },
            updated: updatedDate
              ? {
                  raw: metadata.updated,
                  formatted: updatedDate.toLocaleString(),
                }
              : null,
          },
          users: {
            createdBy: createdByUserIds, // Array of user IDs who created this file
            orderId: orderId, // The order ID associated with this file
            details: validUserDetails, // Detailed user information including profile pictures
          },
          metadata: {
            // Include standard metadata
            generation: metadata.generation,
            metageneration: metadata.metageneration,
            etag: metadata.etag,
            storageClass: metadata.storageClass,
            // Include custom metadata if available
            custom: metadata || {},
          },
          url: publicUrl,
          isPublic:
            metadata.acl &&
            metadata.acl.some((acl) => acl.entity === "allUsers"),
        };
      })
    );

    // If userId is provided, filter files by that user
    let filteredFiles = allFormattedFiles;

    if (userId) {
      try {
        // Convert userId to string for consistent comparison
        const userIdStr = userId.toString();
        
        // First, identify all folders that the user has access to
        const accessibleFolders = allFormattedFiles
          .filter(file => {
            try {
              // Check if this is a folder (ends with /)
              if (!file.path.endsWith('/')) return false;
              
              // Check if user has access to this folder based on createdBy field
              if (file.users && file.users.createdBy) {
                // Handle different formats of the createdBy field
                // Case 1: createdBy is an array
                if (Array.isArray(file.users.createdBy)) {
                  return file.users.createdBy.some(id => id && id.toString() === userIdStr);
                }
                
                // Case 2: createdBy is a JSON string
                if (typeof file.users.createdBy === 'string') {
                  try {
                    const createdByArray = JSON.parse(file.users.createdBy);
                    if (Array.isArray(createdByArray)) {
                      return createdByArray.some(id => id && id.toString() === userIdStr);
                    }
                  } catch (e) {
                    // If parsing fails, check if the string itself matches
                    return file.users.createdBy === userIdStr;
                  }
                }
              }
              return false;
            } catch (error) {
              // Skip this folder if there's an error processing it
              return false;
            }
          })
          .map(folder => folder.path);
        
        // Then filter files to include:
        // 1. Files where the user is in the createdBy array OR
        // 2. Files that are in a folder where the user has access
        filteredFiles = allFormattedFiles.filter((file) => {
          try {
            // Check if the user ID is in the createdBy array
            if (file.users && file.users.createdBy) {
              // Case 1: createdBy is already an array
              if (Array.isArray(file.users.createdBy)) {
                if (file.users.createdBy.some(id => id && id.toString() === userIdStr)) {
                  return true;
                }
              }
              
              // Case 2: createdBy is a JSON string
              if (typeof file.users.createdBy === 'string') {
                try {
                  const createdByArray = JSON.parse(file.users.createdBy);
                  if (Array.isArray(createdByArray) && 
                      createdByArray.some(id => id && id.toString() === userIdStr)) {
                    return true;
                  }
                } catch (e) {
                  // If parsing fails, check if the string itself matches
                  if (file.users.createdBy === userIdStr) {
                    return true;
                  }
                }
              }
            }
            
            // Check if the file is in a folder that the user has access to
            return accessibleFolders.some(folderPath => 
              file.path.startsWith(folderPath) && file.path !== folderPath
            );
          } catch (error) {
            // Skip this file if there's an error processing it
            return false;
          }
        });
      } catch (error) {
        // If there's an error in the filtering process, return all files
        // This is a fallback to ensure the API doesn't fail completely
        filteredFiles = allFormattedFiles;
      }
    }
    
    // Take only the first 10 files after filtering
    return filteredFiles.length > 0 ? filteredFiles.slice(0, 10) : [];
  } catch (error) {
    console.error("Error fetching recent files:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to fetch recent files"
    );
  }
};

/**
 * Get files for a specific order ID
 * @param {string} orderId - The order ID
 * @returns {Promise<Object>} - Object containing files in the order's folder
 */
const getFilesByOrderIdold = async (orderId) => {
  try {
    // Get the order details to generate the folder name
    const { Order } = require("../models");
    const getLastFiveChars = require("../utils/getLastFiveCharc");

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return {
        success: false,
        error: "Order not found",
      };
    }

    // Use the stored folder path from order.file_path.dir_name (set during order creation)
    const folderName = order.file_path?.dir_name || order.order_name;

    // Get files from the folder
    const folderPath = `Website_Shoots_Flow/${folderName}/`;

    // Get files from GCS with the folder prefix
    const [files] = await bucket.getFiles({ prefix: folderPath });

    // Format the response
    const filesResponse = files.map((file) => {
      // Get the filename from the path
      const pathParts = file.name.split("/");
      const fileName =
        pathParts[pathParts.length - 1] ||
        pathParts[pathParts.length - 2] ||
        "";

      // Format file size
      const sizeInBytes = parseInt(file.metadata.size || 0, 10);
      let formattedSize = sizeInBytes + " B";
      if (sizeInBytes >= 1024) {
        formattedSize = (sizeInBytes / 1024).toFixed(2) + " KB";
      }
      if (sizeInBytes >= 1024 * 1024) {
        formattedSize = (sizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
      }

      // Extract metadata
      let createdByArray = [];
      const createdBy = file.metadata?.metadata?.createdBy;

      if (createdBy) {
        try {
          // Try to parse as JSON
          createdByArray = JSON.parse(createdBy);
          // If it's not an array, convert to array
          if (!Array.isArray(createdByArray)) {
            createdByArray = [createdBy];
          }
        } catch (e) {
          // If parsing fails, treat as a single string ID
          createdByArray = [createdBy];
        }
      }
      console.log('createdByArray:', file);
      // Return only the requested fields
      return {
        contentType: file.metadata.contentType || "",
        downloadLink: file.metadata.mediaLink,
        path: file.name.replace("Website_Shoots_Flow/", ""),
        name: fileName,
        url: `https://storage.googleapis.com/${
          bucket.name
        }/${encodeUrlPath(file.name)}`,
        fullPath: file.name,
        createdBy: createdByArray,
        metaId: file.metadata.generation,
      };
    });

    return {
      success: true,
      orderId: orderId,
      orderName: order.order_name,
      folderName: folderName,
      folderPath: folderPath,
      files: filesResponse,
      totalFiles: filesResponse.length,
    };
  } catch (error) {
    console.error("Error fetching files for order:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};
const getFilesByOrderId = async (orderId) => {
  try {
    // Get the order details to generate the folder name
    const { Order } = require("../models");
    const getLastFiveChars = require("../utils/getLastFiveCharc");

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return {
        success: false,
        error: "Order not found",
      };
    }

    // Use the stored folder path from order.file_path.dir_name (set during order creation)
    const folderName = order.file_path?.dir_name || order.order_name;

    // Get files from the folder
    const folderPath = `Website_Shoots_Flow/${folderName}/`;

    // Get files from GCS with the folder prefix
    const [files] = await bucket.getFiles({ prefix: folderPath });

    // Format the response
    const filesResponse = files
      .filter(file => !file.name.endsWith('/')) // Filter out folders
      .map((file) => {
        // Get the filename from the path
        const pathParts = file.name.split("/");
        const fileName =
          pathParts[pathParts.length - 1] ||
          pathParts[pathParts.length - 2] ||
          "";

        // Format file size
        const sizeInBytes = parseInt(file.metadata.size || 0, 10);
        let formattedSize = sizeInBytes + " B";
        if (sizeInBytes >= 1024) {
          formattedSize = (sizeInBytes / 1024).toFixed(2) + " KB";
        }
        if (sizeInBytes >= 1024 * 1024) {
          formattedSize = (sizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
        }

        // Extract metadata
        let createdByArray = [];
        const createdBy = file.metadata?.metadata?.createdBy;

        if (createdBy) {
          try {
            // Try to parse as JSON
            createdByArray = JSON.parse(createdBy);
            // If it's not an array, convert to array
            if (!Array.isArray(createdByArray)) {
              createdByArray = [createdBy];
            }
          } catch (e) {
            // If parsing fails, treat as a single string ID
            createdByArray = [createdBy];
          }
        }
        
        // Return only the requested fields
        return {
          contentType: file.metadata.contentType || "",
          downloadLink: file.metadata.mediaLink,
          path: file.name.replace("Website_Shoots_Flow/", ""),
          name: fileName,
          url: `https://storage.googleapis.com/${
            bucket.name
          }/${encodeUrlPath(file.name)}`,
          fullPath: file.name,
          createdBy: createdByArray,
          metaId: file.metadata.generation,
        };
      });

    return {
      success: true,
      orderId: orderId,
      orderName: order.order_name,
      folderName: folderName,
      folderPath: folderPath,
      files: filesResponse,
      totalFiles: filesResponse.length,
    };
  } catch (error) {
    console.error("Error fetching files for order:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get files for a specific order folder (pre_production or post_production)
 * This bypasses user permission filtering and returns ALL files for the order
 * Both CP and Client should see all files uploaded for their orders
 *
 * @param {String} orderId - Order ID
 * @param {String} folderType - 'pre' or 'post'
 * @param {String} subPath - Optional subpath within the order folder (e.g., 'raw_footage')
 * @returns {Object} Files and folders for the order
 */
const getOrderFilesForPrePost = async (orderId, folderType = 'pre', subPath = '') => {
  try {
    console.log('📂 ========== getOrderFilesForPrePost CALLED ==========');
    console.log('📂 Parameters:', { orderId, folderType, subPath });

    // Get the order details to generate the folder name
    const { Order } = require("../models");
    const getLastFiveChars = require("../utils/getLastFiveCharc");

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return {
        success: false,
        error: "Order not found",
      };
    }

    // Use the stored folder path from order.file_path.dir_name (set during order creation)
    let folderName = order.file_path?.dir_name || order.order_name;

    // Strip Website_Shoots_Flow/ prefix if present (handles legacy corrupted dir_name values)
    if (folderName.startsWith('Website_Shoots_Flow/')) {
      folderName = folderName.substring('Website_Shoots_Flow/'.length);
    }

    // Actual GCS structure: Website_Shoots_Flow/{orderFolder}/Post-Production/ or Pre-Production/
    const subFolderName = folderType === 'post' ? 'Post-Production' : 'Pre-Production';

    // Build the full path with Website_Shoots_Flow prefix
    let folderPath = `Website_Shoots_Flow/${folderName}/${subFolderName}`;
    if (subPath) {
      folderPath = `${folderPath}/${subPath}`;
    }
    // Ensure it ends with /
    if (!folderPath.endsWith('/')) {
      folderPath += '/';
    }

    console.log('📂 Fetching files from GCS path:', folderPath);

    // Get files from GCS with the folder prefix
    const [files] = await bucket.getFiles({ prefix: folderPath });

    console.log('📂 Found', files.length, 'total items in GCS');

    // Separate files and folders
    const filesOnly = [];
    const foldersMap = new Map();

    for (const file of files) {
      const relativePath = file.name.replace(folderPath, '');

      // Skip the folder itself
      if (!relativePath) continue;

      // Check if this is a direct child or nested
      const segments = relativePath.split('/').filter(Boolean);

      if (segments.length === 0) continue;

      if (segments.length === 1) {
        // Direct file in this folder
        if (!file.name.endsWith('/')) {
          filesOnly.push({
            name: segments[0],
            path: relativePath,
            fullPath: file.name,
            isFolder: false,
            size: parseInt(file.metadata.size || 0, 10),
            contentType: file.metadata.contentType || '',
            timeCreated: file.metadata.timeCreated,
            updated: file.metadata.updated,
            url: `https://storage.googleapis.com/${bucket.name}/${encodeUrlPath(file.name)}`,
            downloadLink: file.metadata.mediaLink,
          });
        }
      } else {
        // This is a nested item, so the first segment is a folder
        const folderName = segments[0];
        if (!foldersMap.has(folderName)) {
          foldersMap.set(folderName, {
            name: folderName,
            path: `${folderName}/`,
            isFolder: true,
            timeCreated: file.metadata.timeCreated,
          });
        }
      }
    }

    const folders = Array.from(foldersMap.values());

    console.log('📂 Returning', filesOnly.length, 'files and', folders.length, 'folders');

    return {
      success: true,
      orderId: orderId,
      orderName: order.order_name,
      folderName: folderName,
      basePath: subFolderName,
      currentPath: subPath,
      files: filesOnly,
      folders: folders,
      totalFiles: filesOnly.length,
      totalFolders: folders.length,
    };
  } catch (error) {
    console.error("❌ Error fetching order files:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Make a file public by updating its ACL
 * @param {string} filePath - Path to the file in GCS
 * @returns {Promise<Object>} - Object containing success status and public URL
 */
const makeFilePublic = async (filePath) => {
  try {
    const file = bucket.file(filePath);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return {
        success: false,
        error: "File not found",
      };
    }

    // Make the file publicly accessible
    await file.makePublic();

    // Generate a public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return {
      success: true,
      publicUrl: publicUrl,
    };
  } catch (error) {
    console.error("Error making file public:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Check if a user has permission to upload to a specific folder based on folder type and role
 * @param {string} folderPath - The folder path to check
 * @param {string} role - The user's role (admin, pm, cp, user)
 * @returns {Promise<Object>} - Object with canUpload boolean and reason string
 *
 * Upload Permission Rules:
 * - preproduction: Admin, PM, and Users can upload (CP cannot upload)
 * - postproduction: Admin, PM, and CP can upload (User cannot upload)
 * - postproduction_raw_footage: Admin, PM, and CP can upload (User cannot upload)
 * - postproduction_edited_footage: Admin, PM, and CP can upload (User cannot upload)
 * - postproduction_final_deliverables: Admin and PM can upload (CP and User cannot upload)
 * - root/null: Everyone with access can upload
 */
const checkUploadPermission = async (folderPath, role) => {
  try {
    console.log('🔐 Checking upload permission:', { folderPath, role });

    const isAdmin = role === "admin" || role === "post_production_manager";
    const isPM = role === "pm" || role === "post_production_manager";
    const isCP = role === "cp";
    const isUser = role === "user";

    // Admin and PM can upload anywhere
    if (isAdmin || isPM) {
      return { canUpload: true, reason: 'Admin/PM has full upload access' };
    }

    // Normalize folder path for lookup
    let normalizedPath = folderPath;
    if (normalizedPath.startsWith('Website_Shoots_Flow/')) {
      normalizedPath = normalizedPath.substring(19);
    } else if (normalizedPath.startsWith('shoots/')) {
      normalizedPath = normalizedPath.substring(7);
    }
    if (!normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath + '/';
    }

    // Find the folder in the database
    let folder = await FileMeta.findOne({
      path: normalizedPath,
      isFolder: true
    });

    // If not found, try to extract parent folder from file path
    if (!folder && !folderPath.endsWith('/')) {
      const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/') + 1);
      folder = await FileMeta.findOne({
        path: parentPath,
        isFolder: true
      });
    }

    // Also check if the path contains a production folder type
    const pathLower = folderPath.toLowerCase();
    let detectedFolderType = null;

    if (pathLower.includes('/preproduction/') || pathLower.endsWith('/preproduction') ||
        pathLower.includes('/pre-production/') || pathLower.endsWith('/pre-production')) {
      detectedFolderType = 'preproduction';
    } else if (pathLower.includes('/postproduction/') || pathLower.endsWith('/postproduction') ||
               pathLower.includes('/post-production/') || pathLower.endsWith('/post-production')) {
      detectedFolderType = 'postproduction';
    } else if (pathLower.includes('/raw footage/') || pathLower.endsWith('/raw footage')) {
      detectedFolderType = 'postproduction_raw_footage';
    } else if (pathLower.includes('/edited footage/') || pathLower.endsWith('/edited footage')) {
      detectedFolderType = 'postproduction_edited_footage';
    } else if (pathLower.includes('/final deliverables/') || pathLower.endsWith('/final deliverables')) {
      detectedFolderType = 'postproduction_final_deliverables';
    }

    const folderType = folder?.folderType || detectedFolderType;

    console.log('🔐 Folder found:', {
      folderPath: folder?.path,
      folderType,
      detectedFolderType,
      role
    });

    // Apply permission rules based on folder type
    if (folderType === 'preproduction') {
      // Users CAN upload to preproduction folder
      if (isUser) {
        return {
          canUpload: true,
          reason: 'Users can upload to Pre-Production folder',
          folderType
        };
      }
      // CP cannot upload to preproduction
      if (isCP) {
        return {
          canUpload: false,
          reason: `Content Providers cannot upload to ${folderType} folder. Only Admin, Project Manager, and Users can upload here.`,
          folderType
        };
      }
    } else if (folderType === 'postproduction') {
      // CP CAN upload to postproduction (for OrderFileExplorer), User cannot
      if (isCP) {
        return {
          canUpload: true,
          reason: 'Content Providers can upload to Post-Production folder',
          folderType
        };
      }
      if (isUser) {
        return {
          canUpload: false,
          reason: `Users cannot upload to ${folderType} folder. Only Admin, Project Manager, and Content Providers can upload here.`,
          folderType
        };
      }
    } else if (folderType === 'postproduction_raw_footage' || folderType === 'postproduction_edited_footage') {
      // CP can upload to Raw Footage and Edited Footage, User cannot upload
      if (isUser) {
        return {
          canUpload: false,
          reason: `Users cannot upload to ${folderType} folder. Only Admin, Project Manager, and Content Providers can upload here.`,
          folderType
        };
      }
      if (isCP) {
        return {
          canUpload: true,
          reason: `CP can upload to ${folderType} folder`,
          folderType
        };
      }
    } else if (folderType === 'postproduction_final_deliverables') {
      // Only Admin and PM can upload to Final Deliverables, CP and User cannot upload
      if (isCP) {
        return {
          canUpload: false,
          reason: `Content Providers cannot upload to ${folderType} folder. Only Admin and Project Manager can upload here.`,
          folderType
        };
      }
      if (isUser) {
        return {
          canUpload: false,
          reason: `Users cannot upload to ${folderType} folder. Only Admin and Project Manager can upload here.`,
          folderType
        };
      }
    }

    // Users can only upload to Pre-Production folder, not to root or other folders
    if (isUser) {
      return {
        canUpload: false,
        reason: 'Users can only upload to Pre-Production folder. Other folders are view-only.',
        folderType
      };
    }

    // Default: allow upload for root folders or unknown folder types (for Admin, PM, CP)
    return { canUpload: true, reason: 'Upload permitted', folderType };
  } catch (error) {
    console.error('❌ Error checking upload permission:', error);
    return { canUpload: false, reason: 'Error checking permissions', error: error.message };
  }
};

/**
 * Get folder permissions info for a specific folder
 * @param {string} folderPath - The folder path
 * @param {string} role - The user's role
 * @returns {Promise<Object>} - Object with visibility and upload permission info
 */
const getFolderPermissions = async (folderPath, role) => {
  const isAdmin = role === "admin" || role === "post_production_manager";
  const isPM = role === "pm" || role === "post_production_manager";
  const isCP = role === "cp";
  const isUser = role === "user";

  // Normalize folder path for lookup
  let normalizedPath = folderPath;
  if (normalizedPath.startsWith('Website_Shoots_Flow/')) {
    normalizedPath = normalizedPath.substring(19);
  } else if (normalizedPath.startsWith('shoots/')) {
    normalizedPath = normalizedPath.substring(7);
  }
  if (!normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath + '/';
  }

  // Find the folder in the database
  const folder = await FileMeta.findOne({
    path: normalizedPath,
    isFolder: true
  });

  const folderType = folder?.folderType || null;

  let canView = true;
  let canUpload = true;

  // Visibility rules
  // Users can view: Root, Pre-Production (can upload), Post-Production (view-only), Edited Footage (view-only), and Final Deliverables (view-only)
  if (folderType === 'preproduction') {
    canView = isAdmin || isPM || isCP || isUser; // Everyone can view
    canUpload = isAdmin || isPM || isUser; // Users CAN upload to Pre-Production
  } else if (folderType === 'postproduction') {
    canView = isAdmin || isPM || isCP || isUser; // Everyone can view
    canUpload = isAdmin || isPM; // Only Admin and PM can upload
  } else if (folderType === 'postproduction_raw_footage') {
    canView = isAdmin || isPM || isCP; // Users cannot view raw footage
    canUpload = isAdmin || isPM || isCP; // CP can upload
  } else if (folderType === 'postproduction_edited_footage') {
    canView = isAdmin || isPM || isCP || isUser; // Users can view edited footage
    canUpload = isAdmin || isPM || isCP; // CP can upload
  } else if (folderType === 'postproduction_final_deliverables') {
    canView = isAdmin || isPM || isCP || isUser; // Everyone can view
    canUpload = isAdmin || isPM; // Only Admin and PM can upload
  }

  return {
    folderPath: normalizedPath,
    folderType,
    canView,
    canUpload,
    role,
    permissions: {
      admin: { canView: true, canUpload: true },
      pm: { canView: true, canUpload: true },
      cp: {
        canView: folderType === 'preproduction' ||
                  folderType === 'postproduction' ||
                  folderType === 'postproduction_raw_footage' ||
                  folderType === 'postproduction_edited_footage' ||
                  folderType === 'postproduction_final_deliverables' ||
                  folderType === null ||
                  folderType === 'root',
        canUpload: folderType === 'postproduction_raw_footage' ||
                  folderType === 'postproduction_edited_footage' ||
                  folderType === null ||
                  folderType === 'root'
      },
      user: {
        canView: folderType === null ||
                 folderType === 'root' ||
                 folderType === 'preproduction' ||
                 folderType === 'postproduction' ||
                 folderType === 'postproduction_edited_footage' ||
                 folderType === 'postproduction_final_deliverables', // User can view pre/post-production, edited footage, and final deliverables
        canUpload: folderType === 'preproduction' // Users can ONLY upload to Pre-Production folder
      }
    }
  };
};

/**
 * Get file counts for workflow folders (preproduction, work-in-progress, final-delivery)
 * @param {string} baseFolderPath - The base folder path (e.g., "User's shoot-raw_f3f51/")
 * @param {string} userId - User ID for access control
 * @param {string} role - User role (admin, user, cp)
 * @returns {Object} - Counts for each workflow category
 */
const getFolderCounts = async (baseFolderPath, userId, role) => {
  try {
    console.log('📊 Getting folder counts for:', baseFolderPath);
    console.log('   User ID:', userId);
    console.log('   Role:', role);

    const isAdmin = role === 'admin' || role === 'post_production_manager' || role === 'pm';
    const isUser = role === 'user';

    // Normalize the base path - remove trailing slash
    const normalizedBase = baseFolderPath.replace(/\/$/, '');
    console.log('   Normalized base path:', normalizedBase);

    // Check if user is the client/owner of the parent folder
    let isClientOfFolder = false;
    if (!isAdmin) {
      try {
        const userIdStr = userId?.toString();
        
        // First, try to find the folder in FileMeta
        const parentFolder = await FileMeta.findOne({
          path: normalizedBase,
          isFolder: true
        }).lean();

        if (parentFolder) {
          const folderUserId = parentFolder.userId?.toString();
          const folderClientId = parentFolder.metadata?.client_id?.toString();
          const folderCpIds = parentFolder.metadata?.cpIds || [];

          // Check if user is the folder owner, client, or in CP list
          if (folderUserId === userIdStr || 
              folderClientId === userIdStr ||
              folderCpIds.includes(userIdStr) ||
              folderCpIds.some(cp => typeof cp === 'object' && cp.id?.toString() === userIdStr)) {
            isClientOfFolder = true;
            console.log('   ✅ User is the client/owner of this folder (via FileMeta) - granting access to all files');
          }
        }
        
        // If not found in FileMeta or not granted access, check GCS folder metadata
        if (!isClientOfFolder && bucket) {
          try {
            const gcsFolderPath = `Website_Shoots_Flow/${normalizedBase}/`;
            const gcsFolder = bucket.file(gcsFolderPath);
            const [exists] = await gcsFolder.exists();
            
            if (exists) {
              const [gcsFolderMetadata] = await gcsFolder.getMetadata();
              
              if (gcsFolderMetadata.metadata) {
                // Check createdBy field
                if (gcsFolderMetadata.metadata.createdBy) {
                  try {
                    const createdBy = JSON.parse(gcsFolderMetadata.metadata.createdBy);
                    if (Array.isArray(createdBy) && createdBy.includes(userIdStr)) {
                      isClientOfFolder = true;
                      console.log('   ✅ User is in folder createdBy list (via GCS) - granting access to all files');
                    }
                  } catch (e) {
                    // Ignore parsing errors
                  }
                }
              }
            }
          } catch (gcsError) {
            console.error('   ⚠️  Error checking GCS folder metadata:', gcsError.message);
          }
        }
      } catch (error) {
        console.error('   ⚠️  Error checking folder ownership:', error.message);
      }
    }

    // Build access filter for non-admin users
    // If user is the client of the folder, they get access to all files
    let accessFilter = {};
    if (!isAdmin && !isClientOfFolder) {
      const userIdStr = userId?.toString();
      accessFilter = {
        $or: [
          { userId: userId },
          { 'metadata.cpIds': userIdStr },
          { 'metadata.cpIds': userId },
          { 'metadata.cpIds.id': userIdStr },
          { 'metadata.cpIds.id': userId },
        ]
      };
    }

    // First try to get files from FileMeta (MongoDB)
    let allFiles = await FileMeta.find({
      path: new RegExp(`^${normalizedBase}/`, 'i'),
      isFolder: { $ne: true },
      ...(isAdmin ? {} : accessFilter)
    }).select('path mimeType contentType size userId metadata').lean();

    console.log(`   Files found in FileMeta: ${allFiles.length}`);

    // If FileMeta returns 0, try to get files from GCS directly
    // WARNING: For non-admin users, GCS fallback won't have user filtering
    // We should only use FileMeta for accurate user-based counts
    if (allFiles.length === 0 && bucket && isAdmin) {
      console.log('   FileMeta empty, fetching from GCS (admin only)...');
      try {
        const gcsFolderPath = `Website_Shoots_Flow/${normalizedBase}/`;
        console.log(`   Fetching from GCS path: ${gcsFolderPath}`);
        const [gcsFiles] = await bucket.getFiles({ prefix: gcsFolderPath });
        console.log(`   Total GCS files found: ${gcsFiles.length}`);

        // Helper to detect content type from file extension
        const getContentTypeFromExtension = (filename) => {
          const ext = (filename || '').toLowerCase().split('.').pop();
          const mimeTypes = {
            // Images
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
            'bmp': 'image/bmp', 'ico': 'image/x-icon', 'tiff': 'image/tiff', 'tif': 'image/tiff',
            'heic': 'image/heic', 'heif': 'image/heif', 'raw': 'image/raw', 'cr2': 'image/x-canon-cr2',
            'nef': 'image/x-nikon-nef', 'arw': 'image/x-sony-arw',
            // Videos
            'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv',
            'flv': 'video/x-flv', 'm4v': 'video/x-m4v', '3gp': 'video/3gpp',
            'mpeg': 'video/mpeg', 'mpg': 'video/mpeg', 'mts': 'video/mp2t',
            // Audio
            'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
            // Documents
            'pdf': 'application/pdf', 'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          };
          return mimeTypes[ext] || 'application/octet-stream';
        };

        // Filter out folder placeholders and map to our format
        allFiles = gcsFiles
          .filter(file => !file.name.endsWith('/')) // Exclude folder placeholders
          .map(file => {
            const relativePath = file.name.replace(/^shoots\//, '');
            const fileName = relativePath.split('/').pop();
            const contentType = file.metadata?.contentType || getContentTypeFromExtension(fileName);
            return {
              path: relativePath,
              mimeType: contentType,
              contentType: contentType,
              size: parseInt(file.metadata?.size || 0, 10)
            };
          });

        console.log(`   Files found in GCS (after mapping): ${allFiles.length}`);
        if (allFiles.length > 0) {
          console.log(`   Sample paths: ${allFiles.slice(0, 3).map(f => f.path).join(', ')}`);
        }
      } catch (gcsError) {
        console.error('   Error fetching from GCS:', gcsError.message);
      }
    } else if (allFiles.length === 0 && !isAdmin) {
      console.log('   ⚠️  No files found in FileMeta for non-admin user. GCS fallback disabled for user roles (no access control).');
    }

    // Format helper
    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Helper function to check if user has access to a file (for non-admin roles)
    const userHasAccessToFile = (file) => {
      if (isAdmin) return true; // Admins see everything
      if (isClientOfFolder) return true; // Client of folder sees all files in that folder
      
      const userIdStr = userId?.toString();
      const fileUserId = file.userId?.toString();
      
      // Check if file belongs to user
      if (fileUserId === userIdStr) return true;
      
      // Check if user is in cpIds array
      if (file.metadata?.cpIds) {
        const cpIds = Array.isArray(file.metadata.cpIds) ? file.metadata.cpIds : [];
        
        // Check for string match
        if (cpIds.includes(userIdStr) || cpIds.includes(userId)) return true;
        
        // Check for object format { id: userId }
        const hasCpMatch = cpIds.some(cp => {
          if (typeof cp === 'object' && cp.id) {
            return cp.id.toString() === userIdStr;
          }
          return false;
        });
        
        if (hasCpMatch) return true;
      }
      
      return false;
    };

    // Initialize counters
    let counts = {
      all: 0, // Will be calculated based on role permissions
      rootFolder: {
        name: normalizedBase.split('/').pop() || 'Root',
        totalFiles: 0, // Will count only accessible files
        totalSize: 0
      },
      'pre-production': {
        count: 0,
        size: 0,
        types: {}
      },
      'post-production': {
        count: 0,
        size: 0,
        subfolders: {
          'raw-footage': { count: 0, size: 0, types: {} },
          'edited-footage': { count: 0, size: 0, types: {} },
          'final-deliverables': { count: 0, size: 0, types: {} }
        }
      },
      'work-in-progress': {
        count: 0,
        size: 0,
        description: isUser ? 'Edited Footage (work in progress)' : 'Raw Footage + Edited Footage (not yet final)'
      },
      'final-delivery': {
        count: 0,
        size: 0,
        types: {}
      }
    };

    // Categorize files by folder
    allFiles.forEach(file => {
      // For non-admin users, verify access to each file
      // This is crucial when files come from GCS fallback or shared folders
      if (!isAdmin && !userHasAccessToFile(file)) {
        console.log(`   ⚠️  Skipping file (no access): ${file.path}`);
        return; // Skip this file - user doesn't have access
      }

      // Count this file as accessible
      counts.rootFolder.totalFiles++;

      const filePath = file.path.toLowerCase();
      const fileSize = file.size || 0;
      const mimeType = file.mimeType || file.contentType || 'unknown';

      counts.rootFolder.totalSize += fileSize;

      // Determine file type category
      let fileTypeCategory = 'other';
      if (mimeType.startsWith('image/')) fileTypeCategory = 'images';
      else if (mimeType.startsWith('video/')) fileTypeCategory = 'videos';
      else if (mimeType.startsWith('audio/')) fileTypeCategory = 'audio';
      else if (mimeType.includes('pdf')) fileTypeCategory = 'pdf';
      else if (mimeType.includes('document') || mimeType.includes('word')) fileTypeCategory = 'documents';

      // Pre-production files (supports both preproduction and pre-production folder names)
      if (filePath.includes('/preproduction/') || filePath.includes('/pre-production/')) {
        counts['pre-production'].count++;
        counts['pre-production'].size += fileSize;
        counts['pre-production'].types[fileTypeCategory] = (counts['pre-production'].types[fileTypeCategory] || 0) + 1;
      }
      // Post-production - Raw Footage (supports both postproduction and post-production folder names)
      else if (filePath.includes('/postproduction/raw footage/') || filePath.includes('/postproduction/rawfootage/') ||
               filePath.includes('/post-production/raw footage/') || filePath.includes('/post-production/rawfootage/')) {
        counts['post-production'].subfolders['raw-footage'].count++;
        counts['post-production'].subfolders['raw-footage'].size += fileSize;
        counts['post-production'].subfolders['raw-footage'].types[fileTypeCategory] =
          (counts['post-production'].subfolders['raw-footage'].types[fileTypeCategory] || 0) + 1;

        // For non-user roles, add raw footage to post-production and work-in-progress counts
        if (!isUser) {
          counts['post-production'].count++;
          counts['post-production'].size += fileSize;
          counts['work-in-progress'].count++;
          counts['work-in-progress'].size += fileSize;
        }
        // For user role: Raw footage is HIDDEN - don't add to any visible counts
      }
      // Post-production - Edited Footage (supports both postproduction and post-production folder names)
      else if (filePath.includes('/postproduction/edited footage/') || filePath.includes('/postproduction/editedfootage/') ||
               filePath.includes('/post-production/edited footage/') || filePath.includes('/post-production/editedfootage/')) {
        counts['post-production'].count++;
        counts['post-production'].size += fileSize;
        counts['post-production'].subfolders['edited-footage'].count++;
        counts['post-production'].subfolders['edited-footage'].size += fileSize;
        counts['post-production'].subfolders['edited-footage'].types[fileTypeCategory] =
          (counts['post-production'].subfolders['edited-footage'].types[fileTypeCategory] || 0) + 1;

        // Add to work in progress (visible to all roles)
        counts['work-in-progress'].count++;
        counts['work-in-progress'].size += fileSize;
      }
      // Post-production - Final Deliverables (supports both postproduction and post-production folder names)
      else if (filePath.includes('/postproduction/final deliverables/') || filePath.includes('/postproduction/finaldeliverables/') ||
               filePath.includes('/post-production/final deliverables/') || filePath.includes('/post-production/finaldeliverables/')) {
        counts['post-production'].count++;
        counts['post-production'].size += fileSize;
        counts['post-production'].subfolders['final-deliverables'].count++;
        counts['post-production'].subfolders['final-deliverables'].size += fileSize;
        counts['post-production'].subfolders['final-deliverables'].types[fileTypeCategory] =
          (counts['post-production'].subfolders['final-deliverables'].types[fileTypeCategory] || 0) + 1;

        // Add to final delivery
        counts['final-delivery'].count++;
        counts['final-delivery'].size += fileSize;
        counts['final-delivery'].types[fileTypeCategory] = (counts['final-delivery'].types[fileTypeCategory] || 0) + 1;
      }
      // Other post-production files (not in specific subfolders) - supports both naming conventions
      else if (filePath.includes('/postproduction/') || filePath.includes('/post-production/')) {
        counts['post-production'].count++;
        counts['post-production'].size += fileSize;
      }
    });

    // Calculate "all" count based on role permissions
    // For USER role: preproduction + edited footage + final deliverables (NO raw footage)
    // For other roles: all files from preproduction and postproduction
    if (isUser) {
      counts.all = counts['pre-production'].count +
                   counts['post-production'].subfolders['edited-footage'].count +
                   counts['post-production'].subfolders['final-deliverables'].count;
    } else {
      counts.all = counts['pre-production'].count + counts['post-production'].count;
    }

    console.log(`📊 Access summary for ${role} role:`);
    console.log(`   Total files fetched: ${allFiles.length}`);
    console.log(`   Accessible files: ${counts.rootFolder.totalFiles}`);
    console.log(`   Pre-production: ${counts['pre-production'].count}`);
    console.log(`   Post-production (total): ${counts['post-production'].count}`);
    console.log(`   - Raw footage: ${counts['post-production'].subfolders['raw-footage'].count}${isUser ? ' (HIDDEN from user)' : ''}`);
    console.log(`   - Edited footage: ${counts['post-production'].subfolders['edited-footage'].count}`);
    console.log(`   - Final deliverables: ${counts['post-production'].subfolders['final-deliverables'].count}`);
    console.log(`   Work in progress: ${counts['work-in-progress'].count}`);
    console.log(`   Final delivery: ${counts['final-delivery'].count}`);

    // Add formatted sizes
    counts.rootFolder.totalSizeFormatted = formatSize(counts.rootFolder.totalSize);
    counts['pre-production'].sizeFormatted = formatSize(counts['pre-production'].size);
    counts['post-production'].sizeFormatted = formatSize(counts['post-production'].size);
    counts['work-in-progress'].sizeFormatted = formatSize(counts['work-in-progress'].size);
    counts['final-delivery'].sizeFormatted = formatSize(counts['final-delivery'].size);

    Object.keys(counts['post-production'].subfolders).forEach(subfolder => {
      counts['post-production'].subfolders[subfolder].sizeFormatted =
        formatSize(counts['post-production'].subfolders[subfolder].size);
    });

    console.log('📊 Detailed folder counts:', JSON.stringify(counts, null, 2));

    return counts;
  } catch (error) {
    console.error('❌ Error getting folder counts:', error.message);
    console.error(error.stack);

    // Return empty structure on error
    return {
      all: 0,
      rootFolder: {
        name: 'Root',
        totalFiles: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B'
      },
      'pre-production': {
        count: 0,
        size: 0,
        sizeFormatted: '0 B',
        types: {}
      },
      'post-production': {
        count: 0,
        size: 0,
        sizeFormatted: '0 B',
        subfolders: {
          'raw-footage': { count: 0, size: 0, sizeFormatted: '0 B', types: {} },
          'edited-footage': { count: 0, size: 0, sizeFormatted: '0 B', types: {} },
          'final-deliverables': { count: 0, size: 0, sizeFormatted: '0 B', types: {} }
        }
      },
      'work-in-progress': {
        count: 0,
        size: 0,
        sizeFormatted: '0 B',
        description: 'Raw Footage + Edited Footage (not yet final)'
      },
      'final-delivery': {
        count: 0,
        size: 0,
        sizeFormatted: '0 B',
        types: {}
      },
      error: error.message
    };
  }
};

/**
 * Get all files recursively from a client folder (preproduction + postproduction)
 * This returns all images and videos from preproduction and postproduction folders
 * For USER role: Returns preproduction + edited footage + final deliverables (NO raw footage)
 * For other roles: Returns all files from preproduction and postproduction
 * @param {string} baseFolderPath - The base folder path (e.g., "ClientFolder_Name")
 * @param {string} userId - User ID for access control
 * @param {string} role - User role (admin, user, cp)
 * @returns {Object} - Array of all files with their metadata
 */
const getAllFilesRecursive = async (baseFolderPath, userId, role, filters = {}) => {
  try {
    console.log('📂 Getting all files recursively for:', baseFolderPath);
    console.log('   User ID:', userId);
    console.log('   Role:', role);

    const isAdmin = role === 'admin' || role === 'post_production_manager' || role === 'pm';
    const isUser = role === 'user';

    // Normalize the base path - remove trailing slash
    const normalizedBase = baseFolderPath.replace(/\/$/, '');
    console.log('   Normalized base path:', normalizedBase);

    // Check if user is the client/owner of the parent folder (same logic as getFolderCounts)
    let isClientOfFolder = false;
    if (!isAdmin) {
      try {
        const userIdStr = userId?.toString();

        // First, try to find the folder in FileMeta
        const parentFolder = await FileMeta.findOne({
          path: normalizedBase,
          isFolder: true
        }).lean();

        if (parentFolder) {
          const folderUserId = parentFolder.userId?.toString();
          const folderClientId = parentFolder.metadata?.client_id?.toString();
          const folderCpIds = parentFolder.metadata?.cpIds || [];

          if (folderUserId === userIdStr ||
              folderClientId === userIdStr ||
              folderCpIds.includes(userIdStr) ||
              folderCpIds.some(cp => typeof cp === 'object' && cp.id?.toString() === userIdStr)) {
            isClientOfFolder = true;
            console.log('   ✅ User is the client/owner of this folder - granting access to all files');
          }
        }

        // If not found in FileMeta, check GCS folder metadata
        if (!isClientOfFolder && bucket) {
          try {
            const gcsFolderPath = `Website_Shoots_Flow/${normalizedBase}/`;
            const gcsFolder = bucket.file(gcsFolderPath);
            const [exists] = await gcsFolder.exists();

            if (exists) {
              const [gcsFolderMetadata] = await gcsFolder.getMetadata();

              if (gcsFolderMetadata.metadata) {
                if (gcsFolderMetadata.metadata.createdBy) {
                  try {
                    const createdBy = JSON.parse(gcsFolderMetadata.metadata.createdBy);
                    if (Array.isArray(createdBy) && createdBy.includes(userIdStr)) {
                      isClientOfFolder = true;
                      console.log('   ✅ User is in folder createdBy list (via GCS) - granting access to all files');
                    }
                  } catch (e) {
                    // Ignore parsing errors
                  }
                }
              }
            }
          } catch (gcsError) {
            console.error('   ⚠️  Error checking GCS folder metadata:', gcsError.message);
          }
        }
      } catch (error) {
        console.error('   ⚠️  Error checking folder ownership:', error.message);
      }
    }

    // Build access filter for non-admin users (skip if user is client/owner of folder)
    let accessFilter = {};
    if (!isAdmin && !isClientOfFolder) {
      const userIdStr = userId?.toString();
      accessFilter = {
        $or: [
          { userId: userId },
          { 'metadata.cpIds': userIdStr },
          { 'metadata.cpIds': userId },
          { 'metadata.cpIds.id': userIdStr },
          { 'metadata.cpIds.id': userId },
        ]
      };
    }

    // Build path filter to get files from preproduction and postproduction folders
    const pathFilter = {
      $or: [
        { path: new RegExp(`^${normalizedBase}/preproduction/`, 'i') },
        { path: new RegExp(`^${normalizedBase}/postproduction/`, 'i') },
        { path: new RegExp(`^${normalizedBase}/pre-production/`, 'i') },
        { path: new RegExp(`^${normalizedBase}/post-production/`, 'i') },
      ]
    };

    // Build the query using $and to properly combine path filter and access filter
    // IMPORTANT: Can't use spread with both having $or - they would overwrite each other!
    let query;
    if (isAdmin || isClientOfFolder) {
      query = {
        $and: [
          pathFilter,
          { isFolder: { $ne: true } }
        ]
      };
    } else {
      query = {
        $and: [
          pathFilter,
          { isFolder: { $ne: true } },
          accessFilter
        ]
      };
    }

    console.log('   MongoDB query:', JSON.stringify(query, null, 2));

    // Get all files from preproduction and postproduction folders (FileMeta)
    // Include Frame.io fields for video playback integration
    let allFiles = await FileMeta.find(query)
      .select('path name size contentType mimeType updatedAt createdAt isPublic userId metadata version fullPath frameioAssetId frameioReviewLink frameioEmbedUrl frameioLinkedAt').lean();

    console.log(`   Files found in FileMeta: ${allFiles.length}`);

    // If FileMeta returns 0, try to get files from GCS directly
    if (allFiles.length === 0 && bucket) {
      console.log('   FileMeta empty, fetching from GCS...');
      try {
        // Fetch ALL files from the base folder and filter by preproduction/postproduction (case-insensitive)
        const basePath = `Website_Shoots_Flow/${normalizedBase}/`;
        console.log(`   Fetching all files from GCS base path: ${basePath}`);

        const [allGcsFiles] = await bucket.getFiles({ prefix: basePath });
        console.log(`   Total files in GCS base folder: ${allGcsFiles.length}`);

        // Filter to only include files from preproduction/postproduction folders (case-insensitive)
        const gcsFiles = allGcsFiles.filter(file => {
          const lowerName = file.name.toLowerCase();
          return lowerName.includes('/preproduction/') ||
                 lowerName.includes('/postproduction/') ||
                 lowerName.includes('/pre-production/') ||
                 lowerName.includes('/post-production/');
        });

        console.log(`   Files in preproduction/postproduction: ${gcsFiles.length}`);

        // Helper to detect content type from file extension
        const getContentTypeFromExtension = (filename) => {
          const ext = (filename || '').toLowerCase().split('.').pop();
          const mimeTypes = {
            // Images
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
            'bmp': 'image/bmp', 'ico': 'image/x-icon', 'tiff': 'image/tiff', 'tif': 'image/tiff',
            'heic': 'image/heic', 'heif': 'image/heif', 'raw': 'image/raw', 'cr2': 'image/x-canon-cr2',
            'nef': 'image/x-nikon-nef', 'arw': 'image/x-sony-arw',
            // Videos
            'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv',
            'flv': 'video/x-flv', 'm4v': 'video/x-m4v', '3gp': 'video/3gpp',
            'mpeg': 'video/mpeg', 'mpg': 'video/mpeg', 'mts': 'video/mp2t',
            // Audio
            'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
            // Documents
            'pdf': 'application/pdf', 'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          };
          return mimeTypes[ext] || 'application/octet-stream';
        };

        // Filter out folder placeholders and map to our format
        allFiles = gcsFiles
          .filter(file => !file.name.endsWith('/')) // Exclude folder placeholders
          .map(file => {
            const relativePath = file.name.replace(/^shoots\//, '');
            const fileName = relativePath.split('/').pop();
            // Try to get contentType from GCS metadata, fallback to extension-based detection
            const contentType = file.metadata?.contentType || getContentTypeFromExtension(fileName);
            return {
              _id: { toString: () => file.id || file.name }, // Mock ObjectId
              path: relativePath,
              name: fileName,
              mimeType: contentType,
              contentType: contentType,
              size: parseInt(file.metadata?.size || 0, 10),
              updatedAt: file.metadata?.updated || new Date().toISOString(),
              isPublic: false
            };
          });

        console.log(`   Files found in GCS (after mapping): ${allFiles.length}`);
        if (allFiles.length > 0) {
          console.log(`   Sample file: ${JSON.stringify(allFiles[0])}`);
        }
      } catch (gcsError) {
        console.error('   Error fetching from GCS:', gcsError.message);
      }
    }

    // Transform files to match frontend FileItem interface
    let transformedFiles = allFiles.map(file => {
      const contentType = file.contentType || file.mimeType || 'application/octet-stream';
      const fileId = file._id ? (typeof file._id.toString === 'function' ? file._id.toString() : file._id) : file.path;
      return {
        id: fileId,
        // Version field is used by frontend for Frame.io status queries
        version: file.version || fileId,
        name: file.name || file.path.split('/').pop(),
        size: file.size || 0,
        contentType: contentType,
        path: file.path,
        fullPath: file.fullPath || `Website_Shoots_Flow/${file.path}`,
        updated: file.updatedAt || file.createdAt || new Date().toISOString(),
        timeCreated: file.createdAt || new Date().toISOString(),
        isFolder: false,
        isPublic: file.isPublic || false,
        // Add download link for convenience
        downloadLink: file.isPublic
          ? `https://storage.googleapis.com/${config.GCP.bucketName}/Website_Shoots_Flow/${file.path}`
          : null,
        // Include Frame.io fields for direct access (optional optimization)
        frameioAssetId: file.frameioAssetId || null,
        frameioEmbedUrl: file.frameioEmbedUrl || null
      };
    });

    // Return all files (not just media) so tab counts and display match
    let filteredFiles = transformedFiles;

    // Apply user role permissions: hide raw footage for users
    if (isUser) {
      console.log('   Applying user role filter (hiding raw footage)...');
      filteredFiles = filteredFiles.filter(file => {
        const lowerPath = (file.path || '').toLowerCase();
        // Exclude raw footage for users (supports both postproduction and post-production folder names)
        const isRawFootage = lowerPath.includes('/postproduction/raw footage/') ||
                            lowerPath.includes('/postproduction/rawfootage/') ||
                            lowerPath.includes('/post-production/raw footage/') ||
                            lowerPath.includes('/post-production/rawfootage/') ||
                            lowerPath.includes('/raw footage/');
        return !isRawFootage;
      });
      console.log(`   After user filter: ${filteredFiles.length} files`);
    }

    // Store unfiltered count before applying user filters
    const unfilteredCount = filteredFiles.length;

    // Apply query filters from request params
    const { search, fileType, sortBy, sortOrder, stage } = filters;

    // Filter by production stage (tab)
    if (stage && stage !== 'all') {
      filteredFiles = filteredFiles.filter(file => {
        const lowerPath = (file.path || '').toLowerCase();
        switch (stage) {
          case 'pre-production':
            return lowerPath.includes('/preproduction/') || lowerPath.includes('/pre-production/') || lowerPath.includes('/pre_production/');
          case 'work-in-progress':
            return lowerPath.includes('/postproduction/') || lowerPath.includes('/post-production/') || lowerPath.includes('/post_production/');
          case 'final-delivery':
            return lowerPath.includes('/final deliverables/') || lowerPath.includes('/finaldeliverables/') ||
                   lowerPath.includes('/final-deliverables/') || lowerPath.includes('/final delivery/') ||
                   lowerPath.includes('/finaldelivery/') || lowerPath.includes('/final-delivery/');
          default:
            return true;
        }
      });
      console.log(`   After stage filter (${stage}): ${filteredFiles.length} files`);
    }

    // Filter by search query (file name)
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      filteredFiles = filteredFiles.filter(file => {
        const fileName = (file.name || '').toLowerCase();
        return fileName.includes(searchLower);
      });
      console.log(`   After search filter ("${search}"): ${filteredFiles.length} files`);
    }

    // Filter by file type
    if (fileType && fileType !== 'all') {
      filteredFiles = filteredFiles.filter(file => {
        const ct = (file.contentType || '').toLowerCase();
        const ext = (file.name || '').toLowerCase().split('.').pop() || '';
        switch (fileType) {
          case 'image':
            return ct.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'heic', 'heif', 'raw', 'cr2', 'nef', 'arw'].includes(ext);
          case 'video':
            return ct.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v', '3gp', 'mpeg', 'mpg', 'mts'].includes(ext);
          case 'document':
            return ct.includes('document') || ct.includes('text') || ct.includes('msword') || ct.includes('wordprocessing') ||
                   ['doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
          case 'pdf':
            return ct.includes('pdf') || ext === 'pdf';
          case 'zip':
            return ct.includes('zip') || ct.includes('compressed') || ct.includes('archive') ||
                   ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);
          default:
            return true;
        }
      });
      console.log(`   After fileType filter (${fileType}): ${filteredFiles.length} files`);
    }

    // Apply sorting
    const order = sortOrder === 'asc' ? 1 : -1;
    if (sortBy) {
      filteredFiles.sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return order * (a.name || '').localeCompare(b.name || '');
          case 'size':
            return order * ((a.size || 0) - (b.size || 0));
          case 'date':
          default:
            return order * (new Date(a.updated || 0).getTime() - new Date(b.updated || 0).getTime());
        }
      });
    } else {
      // Default sort: newest first
      filteredFiles.sort((a, b) => new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime());
    }

    console.log(`   Total files after all filters: ${filteredFiles.length}`);

    return {
      success: true,
      files: filteredFiles,
      totalCount: filteredFiles.length,
      unfilteredCount: unfilteredCount,
      basePath: normalizedBase
    };
  } catch (error) {
    console.error('❌ Error getting all files recursively:', error.message);
    console.error(error.stack);

    return {
      success: false,
      files: [],
      totalCount: 0,
      unfilteredCount: 0,
      error: error.message
    };
  }
};

/**
 * Upload a chat file directly to GCP Storage
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} roomId - The chat room ID
 * @param {string} fileName - Original file name
 * @param {string} contentType - File MIME type
 * @param {string} senderId - Sender user ID
 * @returns {Promise<Object>} Upload result with file URL
 */
const uploadChatFileBuffer = async (fileBuffer, roomId, fileName, contentType, senderId) => {
  if (!gcpEnabled || !bucket) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, "GCP Storage is not configured");
  }

  try {
    await setBucketCors();

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const extension = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
    const uniqueFileName = `${timestamp}_${randomString}${extension}`;

    // Create file path in GCP: chats/{roomId}/{uniqueFileName}
    const filePath = `chats/${roomId}/${uniqueFileName}`;

    const file = bucket.file(filePath);

    // Upload the file buffer
    await file.save(fileBuffer, {
      metadata: {
        contentType: contentType,
        metadata: {
          originalName: fileName,
          uploadedBy: senderId,
          roomId: roomId,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${config.GCP.bucketName}/${filePath}`;

    logger.info(`Chat file uploaded to GCP: ${publicUrl}`);

    return {
      success: true,
      fileUrl: publicUrl,
      fileName: fileName,
      fileType: contentType,
      filePath: filePath,
    };
  } catch (error) {
    logger.error(`Error uploading chat file to GCP: ${error.message}`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to upload file: ${error.message}`);
  }
};

/**
 * Check if GCP is enabled and available
 * @returns {boolean}
 */
const isGcpAvailable = () => {
  return gcpEnabled && bucket !== null;
};

module.exports = {
  createFolder,
  createChatFolder,
  createProductionSubfolders,
  createPostProductionSubfoldersOnly,
  downloadFiles,
  uploadFile,
  deleteFile,
  getFiles,
  getChatFiles,
  bucket,
  updateGcpFolderMetadata,
  removeCpFromMetadata,
  getCpsContent,
  getCpContent,
  deleteCpsContent,
  getUserSettings,
  updateWithUserSettings,
  getRecentFiles,
  getFilesByOrderId,
  getOrderFilesForPrePost,
  makeFilePublic,
  checkUploadPermission,
  getFolderPermissions,
  getFolderCounts,
  getAllFilesRecursive,
  uploadChatFileBuffer,
  isGcpAvailable,
};
