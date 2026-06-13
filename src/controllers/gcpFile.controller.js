const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const config = require("../config/config");
const { Storage } = require("@google-cloud/storage");
const archiver = require("archiver");
const stream = require("stream");
const path = require("path");
const gcpFileService = require("../services/gcpFile.service");
const { orderService, userService } = require("../services");
const { getUserInfoFromToken } = require("../middlewares/permissions");
const { CP } = require("../models");

// =====
const getFiles = catchAsync(async (req, res, next) => {
  try {
    // Get the requested user ID from params
    const requestedUserId = req.params.userId;
    const { path } = req.query; // Optional path query parameter

    console.log('📂 GET /gcp/get-files/:userId - userId:', requestedUserId, 'path:', path);

    // Get role for the requested user
    let role;
    try {
      const userInfo = await userService.getUserById(req.params.userId);
      role = userInfo.role;
    } catch (error) {
      // Default to regular user role if user info can't be retrieved
      console.log(
        "Could not get user role, defaulting to regular user",
        requestedUserId,
        "error-",
        error.message
      );
      role = "user";
    }
    // Check if the logged-in user is an admin or post_production_manager
    const isAdmin = role === "admin" || role === "post_production_manager";

    // Get files for the user - if admin, they can access any user's files
    // If non-admin, they can only access their own files (which we've already verified above)
    const result = await gcpFileService.getFiles(
      requestedUserId,
      isAdmin ? "admin" : role,
      path // Pass the path parameter
    );
    return res.json(result);
  } catch (error) {
    console.error("❌ Error fetching files:", error);
    return next(error);
  }
});

const getChatFiles = catchAsync(async (req, res, next) => {
  let folderPath = req.query.folderpath;
  try {
    const result = await gcpFileService.getChatFiles(folderPath);
    return res.json(result);
  } catch (error) {
    console.error("Error fetching files:", error);
    return next(error);
  }
});

const downloadFolder = catchAsync(async (req, res, next) => {
  let folderPath = req.query.folderpath;
  // Add Website_Shoots_Flow prefix if not present
  folderPath = folderPath.startsWith("Website_Shoots_Flow/")
    ? folderPath
    : `Website_Shoots_Flow/${folderPath}`;
  if (!folderPath) {
    return res.status(400).json({ error: "folderpath is required" });
  }
  try {
    const [files] = await gcpFileService.bucket.getFiles({
      prefix: folderPath,
    });

    if (files.length === 0) {
      return res.status(404).json({ error: "folder not found or is empty" });
    }

    // Calculate total size
    const totalSize = files.reduce(
      (acc, file) => acc + parseInt(file.metadata.size || 0, 10),
      0
    );

    if (req.method === "HEAD") {
      // If this is a HEAD request, just send the total size in the headers and end the response
      res.setHeader("Access-Control-Expose-Headers", "X-Total-Size");
      res.setHeader("X-Total-Size", totalSize.toString());
      return res.status(200).end();
    }

    // Set up response headers for GET request
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(folderPath)}.zip"`
    );
    res.setHeader("X-Total-Size", totalSize.toString());
    console.log("🚀 ~ downloadFolder ~ totalSize:", totalSize);

    // Create a ZIP archive
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Set compression level
    });

    // Set up error handling
    archive.on("error", (err) => {
      console.error("Archive error:", err);
      res.status(500).send("Internal Server Error");
    });

    // Pipe archive data to the response
    archive.pipe(res);

    // Add each file to the archive
    for (const file of files) {
      const fileStream = file.createReadStream();
      const relativePath = file.name.slice(folderPath.length);
      const fileName = relativePath.startsWith("/")
        ? relativePath.slice(1)
        : relativePath;

      if (fileName && fileName.trim() !== "") {
        archive.append(fileStream, { name: fileName });
      } else {
        console.warn(`Skipping file with empty name: ${file.name}`);
      }
    }

    // Finalize the archive
    await archive.finalize();
  } catch (error) {
    console.error("Error in downloadFolder:", error);
    next(error);
  }
});

// set public
const setPublic = catchAsync(async (req, res, next) => {
  try {
    if (!req.body.filepath) {
      return res.status(400).json({ success: false, message: "filepath is required" });
    }

    // Try both path formats: Website_Shoots_Flow and legacy shoots/
    let filePath = req.body.filepath;

    // Don't add prefix if it already has one
    if (!filePath.startsWith('Website_Shoots_Flow/') && !filePath.startsWith('shoots/')) {
      // Try Website_Shoots_Flow first (new format)
      filePath = 'Website_Shoots_Flow/' + filePath;
    }

    let file = gcpFileService.bucket.file(filePath);
    let [exists] = await file.exists();

    // If not found, try legacy shoots/ prefix
    if (!exists && filePath.startsWith('Website_Shoots_Flow/')) {
      const legacyPath = filePath.replace('Website_Shoots_Flow/', 'shoots/');
      file = gcpFileService.bucket.file(legacyPath);
      [exists] = await file.exists();
      if (exists) {
        filePath = legacyPath;
      }
    }

    if (!exists) {
      console.error(`File not found: ${req.body.filepath} (tried: ${filePath})`);
      return res.status(404).json({ success: false, message: "File not found" });
    }

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${gcpFileService.bucket.name}/${filePath}`;

    console.log(`✅ File made public: ${filePath}`);
    return res.json({ success: true, publicUrl });
  } catch (error) {
    console.error("Error making file public:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to make file public" });
  }
});

// set private
const setPrivate = catchAsync(async (req, res, next) => {
  try {
    if (!req.body.filepath) {
      return res.status(400).json({ success: false, message: "filepath is required" });
    }

    // Try both path formats: Website_Shoots_Flow and legacy shoots/
    let filePath = req.body.filepath;

    // Don't add prefix if it already has one
    if (!filePath.startsWith('Website_Shoots_Flow/') && !filePath.startsWith('shoots/')) {
      // Try Website_Shoots_Flow first (new format)
      filePath = 'Website_Shoots_Flow/' + filePath;
    }

    let file = gcpFileService.bucket.file(filePath);
    let [exists] = await file.exists();

    // If not found, try legacy shoots/ prefix
    if (!exists && filePath.startsWith('Website_Shoots_Flow/')) {
      const legacyPath = filePath.replace('Website_Shoots_Flow/', 'shoots/');
      file = gcpFileService.bucket.file(legacyPath);
      [exists] = await file.exists();
      if (exists) {
        filePath = legacyPath;
      }
    }

    if (!exists) {
      console.error(`File not found: ${req.body.filepath} (tried: ${filePath})`);
      return res.status(404).json({ success: false, message: "File not found" });
    }

    await file.makePrivate();
    console.log(`✅ File made private: ${filePath}`);
    return res.json({ success: true });
  } catch (error) {
    console.error("Error making file private:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to make file private" });
  }
});

// get share url
const getShareUrl = catchAsync(async (req, res, next) => {
  try {
    if (!req.body.filepath) {
      return res.status(400).json({ success: false, message: "filepath is required" });
    }

    let filePath = req.body.filepath;

    console.log(`🔗 Received request for share URL. Original path: ${filePath}`);

    // Only add prefix if the path doesn't already have one
    // If it starts with Website_Shoots_Flow/ or shoots/, it's already a full path
    if (!filePath.startsWith('Website_Shoots_Flow/') && !filePath.startsWith('shoots/')) {
      // This is a relative path, add shoots/ prefix for backward compatibility
      filePath = `shoots/${filePath}`;
      console.log(`📝 Added shoots/ prefix: ${filePath}`);
    }

    console.log(`🔗 Generating signed URL for: ${filePath}`);

    let result;
    try {
      result = await gcpFileService.downloadFiles(filePath, req.body.download);
    } catch (error) {
      // If file not found with shoots/ prefix, try Website_Shoots_Flow/ prefix
      if (error.message.includes('File not found') && filePath.startsWith('shoots/')) {
        const altPath = filePath.replace('shoots/', 'Website_Shoots_Flow/');
        console.log(`⚠️ File not found with shoots/ prefix. Trying alternative path: ${altPath}`);
        result = await gcpFileService.downloadFiles(altPath, req.body.download);
      } else {
        throw error;
      }
    }

    if (!result) {
      return res.status(404).json({ success: false, message: "File not found or failed to generate URL" });
    }

    console.log(`✅ Successfully generated share URL for: ${filePath}`);
    return res.json(result);
  } catch (error) {
    console.error("❌ Error getting share URL:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Failed to get share URL" });
  }
});

function getFirstSegment(path) {
  // Find the index of the first '/'
  const index = path.indexOf("/");
  return index !== -1 ? path.substring(0, index) : path;
}

// Shoot File upload with policy

const uploadFileAndUploadPollicy = catchAsync(async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getUserInfoFromToken(authHeader);
    const { role } = user;

    // Remove prefix if already present, then add it
    let cleanPath = req.body.filepath;
    if (cleanPath.startsWith('Website_Shoots_Flow/')) {
      cleanPath = cleanPath.substring(20); // Remove 'Website_Shoots_Flow/' prefix
    } else if (cleanPath.startsWith('shoots/')) {
      cleanPath = cleanPath.substring(7); // Remove 'shoots/' prefix (legacy)
    }

    // Get the folder name (first segment) - this should be the shoot/order folder
    const folderName = getFirstSegment(cleanPath);

    // Validate that we have a folder name (not just a filename)
    if (!folderName || folderName === cleanPath) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filepath. Expected format: "folder-name/filename.ext" or provide orderId in request body.'
      });
    }

    // Add 'Website_Shoots_Flow' prefix to the folder path
    const filePath = `Website_Shoots_Flow/${folderName}`.replace(/\/+/g, "/");
    const file = gcpFileService.bucket.file(`${filePath}/`);

    // Check if Website_Shoots_Flow folder exists
    const shootsFolder = gcpFileService.bucket.file("Website_Shoots_Flow/");
    const [shootsExists] = await shootsFolder.exists();
    if (!shootsExists) {
      await shootsFolder.save("");
    }

    // Check if the specific shoot folder exists
    const [folderExists] = await file.exists();
    if (!folderExists) {
      return res.status(404).json({
        success: false,
        message: `Folder "${filePath}" does not exist. Please create the folder first using /gcp/add-folder endpoint.`
      });
    }

    const [metadata] = await file.getMetadata();

    // Safety check: Only parse orderId if it exists (some folders don't have orders)
    let orderId = null;
    if (metadata.metadata?.orderId) {
      try {
        orderId = JSON.parse(metadata.metadata.orderId);
      } catch (parseError) {
        console.error('❌ Failed to parse orderId from folder metadata:', parseError);
        console.error('Metadata received:', metadata.metadata);
      }
    }

    // Initialize variables outside the if block
    let addedUserId = null;
    let orderName = null;

    // If folder has orderId, update order information
    if (orderId) {
      try {
        const order = await orderService.getOrderById(orderId);
        addedUserId = order.client_id.id;
        orderName = order.order_name;

        await gcpFileService.updateGcpFolderMetadata(
          orderName,
          addedUserId,
          orderId
        );

        await orderService.updateOrderById(orderId, {
          file_path: {
            status: true,
            last_upload: new Date(),
            dir_name: folderName,
          },
        });

        console.log('✅ Order updated:', orderId);
      } catch (orderError) {
        console.error('❌ Error updating order:', orderError);
        // Continue with upload even if order update fails
      }
    } else {
      console.log('ℹ️ Folder has no orderId - treating as regular folder');
    }

    // For non-order folders, use the authenticated user ID
    if (!addedUserId && req.user) {
      addedUserId = req.user.id || req.user._id;
      console.log('ℹ️ Using authenticated user ID:', addedUserId);
    }

    const publicPath = `Website_Shoots_Flow/${cleanPath}`.replace(/\/+/g, "/");
    const result = await gcpFileService.uploadFile(
      publicPath,
      req.body.fileContentType,
      req.body.fileSize,
      addedUserId,
      { orderId: orderId ? JSON.stringify(orderId) : null }
    );
    makeSingleFilePublic(publicPath);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});
// Upload chat files
const uploadChatFiles = catchAsync(async (req, res, next) => {
  try {
    const filePath = `chats/${getFirstSegment(req.body.filepath)}`.replace(
      /\/+/g,
      "/"
    );
    const file = gcpFileService.bucket.file(`${filePath}/`);

    const [metadata] = await file.getMetadata();
    const orderId = JSON.parse(metadata.metadata?.orderId);

    // const userId = await orderService.gestOrderById(orderId);
    // // const addedUserId = userId.client_id.id;
    // // const orderName = userId.order_name;

    const publicPath = `chats/${req.body.filepath}`.replace(/\/+/g, "/");
    const result = await gcpFileService.uploadFile(
      publicPath,
      req.body.fileContentType,
      req.body.fileSize
    );
    makeSingleFilePublic(publicPath);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});
// add folder
const addFolder = catchAsync(async (req, res) => {
  try {
    const { folderpath, folderName, orderId } = req.body;
    const { FileMeta } = require('../models');

    // Extract userId from authenticated user
    const authenticatedUserId = req.user?.id || req.user?._id;
    const authenticatedUserRole = req.user?.role;
    const isCpFolderCreation = authenticatedUserRole === "cp" || authenticatedUserRole === "service_provider";

    console.log('📁 Creating folder:', folderName || folderpath, 'for user:', authenticatedUserId);

    if (!authenticatedUserId) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!folderName && !folderpath && !orderId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'folderName, folderpath, or orderId is required'
      });
    }

    // CRITICAL FIX: Check if this is a subfolder inside an existing folder
    // If so, inherit parent folder's access permissions (userId, cpIds, orderId)
    // This ensures subfolders created by CPs are visible to the client (user) and admin
    let inheritedUserId = authenticatedUserId;
    let inheritedCpIds = null;
    let inheritedOrderId = null;
    let pathToCreate = folderName || folderpath;

    // If orderId is provided, always normalize to the order's actual Beige folder name.
    // This keeps all fallback frontend calls aligned with the backend's real file-manager structure.
    if (orderId) {
      const order = await orderService.getOrderById(orderId, true);

      if (!order) {
        return res.status(httpStatus.NOT_FOUND).json({
          success: false,
          message: 'Order not found'
        });
      }

      pathToCreate = order.file_path?.dir_name || order.order_name;
      inheritedOrderId = order.id || orderId;
      inheritedUserId = order.client_id?.id || order.client_id || authenticatedUserId;
      inheritedCpIds = order.cp_ids || null;

      console.log('📁 Normalized order folder creation request:', {
        orderId: inheritedOrderId,
        pathToCreate,
        inheritedUserId,
      });
    }

    // Parse the path to check for parent folder
    const pathParts = pathToCreate.split('/').filter(Boolean);

    if (!orderId && pathParts.length > 1) {
      // This is a subfolder - try to find parent folder and inherit permissions
      const parentFolderPath = pathParts.slice(0, -1).join('/') + '/';

      console.log('📂 Checking parent folder for permission inheritance:', parentFolderPath);

      // Look up parent folder in database
      const parentFolder = await FileMeta.findOne({
        path: parentFolderPath,
        isFolder: true
      });

      if (parentFolder) {
        console.log('📂 Found parent folder:', {
          path: parentFolder.path,
          userId: parentFolder.userId,
          cpIds: parentFolder.metadata?.cpIds,
          orderId: parentFolder.metadata?.orderId
        });

        // Inherit parent folder's userId (the owner/client)
        if (parentFolder.userId) {
          inheritedUserId = parentFolder.userId;
          console.log('✅ Inheriting userId from parent:', inheritedUserId);
        }

        // Inherit parent folder's cpIds (all CPs with access)
        if (parentFolder.metadata?.cpIds && Array.isArray(parentFolder.metadata.cpIds)) {
          inheritedCpIds = parentFolder.metadata.cpIds;

          // Ensure the authenticated user (creating the folder) is also in cpIds
          const authUserIdStr = authenticatedUserId.toString();
          const cpIdExists = inheritedCpIds.some(cp => {
            const cpIdStr = (typeof cp === 'string' ? cp : (cp.id || cp)?.toString());
            return cpIdStr === authUserIdStr;
          });

          if (!cpIdExists && inheritedUserId.toString() !== authUserIdStr) {
            // Add the authenticated user to cpIds if they're not the owner
            inheritedCpIds = [...inheritedCpIds, authUserIdStr];
          }

          console.log('✅ Inheriting cpIds from parent:', inheritedCpIds);
        }

        // Inherit parent folder's orderId
        if (parentFolder.metadata?.orderId) {
          inheritedOrderId = parentFolder.metadata.orderId;
          console.log('✅ Inheriting orderId from parent:', inheritedOrderId);
        }
      } else {
        console.log('⚠️ Parent folder not found in database, using authenticated user as owner');
      }
    }

    // Create folder in GCS and save to database with inherited permissions
    // Note: createFolder service will automatically add Website_Shoots_Flow/ prefix
    const result = await gcpFileService.createFolder(
      pathToCreate,
      inheritedCpIds, // Pass inherited cpIds (or null for root folders)
      inheritedOrderId, // Pass inherited orderId (or null for root folders)
      inheritedUserId, // Pass inherited userId (parent's owner or authenticated user)
      null,
      null,
      null,
      { skipWorkflowSubfolders: isCpFolderCreation }
    );

    if (result.error) {
      if (result.error === "file-exists") {
        return res.status(httpStatus.CONFLICT).json({
          success: false,
          error: "file-exists",
          message: 'Folder already exists'
        });
      }
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: result.error,
        message: 'Failed to create folder'
      });
    }

    // Check if folder already existed (idempotent behavior)
    if (result.alreadyExists) {
      console.log('✅ Folder already exists, returning existing folder');
      return res.status(httpStatus.OK).json({
        success: true,
        message: 'Folder already exists',
        folder: result.folder,
        alreadyExists: true
      });
    }

    console.log('✅ Folder created successfully with inherited permissions:', {
      path: pathToCreate,
      userId: inheritedUserId,
      cpIds: inheritedCpIds,
      orderId: inheritedOrderId
    });

    return res.status(httpStatus.CREATED).json({
      success: true,
      message: 'Folder created successfully',
      folder: result.folder
    });
  } catch (error) {
    console.error('❌ Error creating folder:', error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'server-error',
      message: error.message
    });
  }
});

// delete file
const deleteFile = catchAsync(async (req, res, next) => {
  const { filepath, filePath } = req.body; // Support both camelCase and PascalCase
  let pathToDelete = filepath || filePath; // Use whichever is provided

  if (!pathToDelete) {
    return res.status(400).json({ error: "filePath is required" });
  }

  console.log(`🗑️ Received delete request for: ${pathToDelete}`);

  try {
    // Add Website_Shoots_Flow/ prefix if path doesn't already have it or shoots/
    if (!pathToDelete.startsWith('Website_Shoots_Flow/') && !pathToDelete.startsWith('shoots/')) {
      pathToDelete = "Website_Shoots_Flow/" + pathToDelete;
      console.log(`📝 Added Website_Shoots_Flow/ prefix: ${pathToDelete}`);
    } else if (pathToDelete.startsWith('shoots/')) {
      // Convert legacy shoots/ prefix to Website_Shoots_Flow/
      pathToDelete = pathToDelete.replace('shoots/', 'Website_Shoots_Flow/');
      console.log(`📝 Converted shoots/ to Website_Shoots_Flow/ prefix: ${pathToDelete}`);
    }

    console.log(`🗑️ Deleting file at: ${pathToDelete}`);
    const result = await gcpFileService.deleteFile(pathToDelete);
    console.log(`✅ File deleted successfully: ${pathToDelete}`);
    return res.json(result);
  } catch (error) {
    console.error(`❌ Error deleting file ${pathToDelete}:`, error.message);
    return next(error);
  }
});

// move file
const moveFile = catchAsync(async (req, res, next) => {
  try {
    if ((await gcpFileService.bucket.file(req.body.destination).exists())[0])
      return res.status(409).json({ alreadyExists: true, success: false });
    const wasPublic = (
      await gcpFileService.bucket.file("shoots/" + req.body.filepath).isPublic()
    )[0];
    await gcpFileService.bucket
      .file("shoots/" + req.body.filepath)
      .move(req.body.destination);
    if (wasPublic)
      await gcpFileService.bucket.file(req.body.destination).makePublic();
    else await gcpFileService.bucket.file(req.body.destination).makePrivate();
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// get settings
const getSettings = catchAsync(async (req, res, next) => {
  return res.json({
    settings: await gcpFileService.getUserSettings().catch(next),
  });
});

// save settings
const saveSettings = catchAsync(async (req, res, next) => {
  await gcpFileService.bucket
    .file("./beige-app-bf2a39a93d2e.json")
    .save(JSON.stringify(req.body.settings))
    .catch(next);
  gcpFileService.updateWithUserSettings();
  return res.json({ success: true });
});

// =====Upload profile pic
const uploadProfilePicture = catchAsync(async (req, res) => {
  const { fileName, fileContentType, fileSize, userId } = req.body;
  const filePath = `ProfileInfo/${userId}/ProfilePic/${fileName}`;
  //TODO: delete all the profile pics of the user and update the new one.

  try {
    // Check if GCP is configured
    if (!gcpFileService.bucket) {
      return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        error: "GCP Storage is not configured",
        details: "Cloud storage service is currently unavailable. Please contact support."
      });
    }

    // Generate signed URL for upload
    const [url] = await gcpFileService.bucket.file(filePath).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: fileContentType, // Set the content type
    });
    // Update the user with new profile pic
    const publicUrl = `https://storage.googleapis.com/${gcpFileService.bucket.name}/${filePath}`;
    // Fetch user to get required fields
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const location = user.location || "Unknown";
    await userService.updateUserById(userId, { profile_picture: publicUrl, location });
    // Return the signed URL to the client
    return res.json({ url, filePath });
  } catch (error) {
    console.error("Error generating signed URL in uploadProfilePicture:", {
      error: error.message,
      stack: error.stack,
      userId,
      fileName,
      fileContentType
    });
    return res.status(500).json({ error: "Failed to generate upload URL", details: error.message });
  }
});

const makeFilePublic = catchAsync(async (req, res) => {
  const { filePaths } = req.body;
  const publicUrls = [];

  for (const filePath of filePaths) {
    try {
      await gcpFileService.bucket.file(filePath).makePublic();
      const publicUrl = `https://storage.googleapis.com/${gcpFileService.bucket.name}/${filePath}`;
      publicUrls.push(publicUrl);
    } catch (error) {
      console.error("Error making file public:", error);
      return res.status(500).json({ error: "Failed to make file public" });
    }
  }

  return res.json({ publicUrls });
});
//
const makeSingleFilePublic = catchAsync(async (publicPath) => {
  try {
    // Wait for file to be available
    const [exists] = await gcpFileService.bucket.file(publicPath).exists();

    if (exists) {
      await gcpFileService.bucket.file(publicPath).makePublic();
    } else {
      // Wait 2 seconds and try again
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const [retryExists] = await gcpFileService.bucket
        .file(publicPath)
        .exists();
      if (retryExists) {
        await gcpFileService.bucket.file(publicPath).makePublic();
      } else {
        console.error(`Failed to make file public: ${publicPath} not found`);
      }
    }
  } catch (error) {
    console.error("Error making file public:", error);
  }
});
// =====

// Content Upload
/**
 * Upload content files (images/videos) for a user
 * Supports up to 5 files in a single request
 */
const uploadCpsContent = catchAsync(async (req, res) => {
  // Get userId and fileType from request body
  const { userId, fileType } = req.body;

  if (!userId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "User ID is required",
    });
  }
  
  // Check if files were uploaded
  if (!req.files || req.files.length === 0) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "No files uploaded",
    });
  }

  // Define allowed file types
  const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/gif",
    "image/webp",
  ];
  const ALLOWED_VIDEO_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv",
    "video/webm",
  ];
  const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

  // Process each uploaded file
  const uploadPromises = req.files.map(async (file) => {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return {
        originalName: file.originalname,
        success: false,
        error: `Unsupported file type: ${file.mimetype}. Only images and videos are allowed.`,
      };
    }

    // Generate a unique filename to prevent collisions
    const fileExtension = file.originalname.split(".").pop();
    const uniqueFileName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}.${fileExtension}`;

    // Determine the appropriate folder path based on fileType
    let folderPath = "";
    folderPath = `ProfileInfo/${userId}/cp-content`;
    const filePath = `${folderPath}/${uniqueFileName}`;

    try {
      // Create a file in the GCS bucket
      const gcsFile = gcpFileService.bucket.file(filePath);

      // Create a write stream to upload the file
      const stream = gcsFile.createWriteStream({
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            size: file.size,
          },
        },
      });

      // Upload the file using a promise
      await new Promise((resolve, reject) => {
        stream.on("error", (error) => {
          console.error(`Error uploading file ${file.originalname}:`, error);
          reject(error);
        });

        stream.on("finish", () => {
          resolve();
        });

        // Write the file buffer to the stream
        stream.end(file.buffer);
      });

      // Make the file publicly accessible
      const result = await gcpFileService.makeFilePublic(filePath);

      if (!result.success) {
        return {
          originalName: file.originalname,
          success: false,
          error: "Failed to make file public",
        };
      }

      return {
        originalName: file.originalname,
        fileName: uniqueFileName,
        filePath,
        size: file.size,
        contentType: file.mimetype,
        publicUrl: result.publicUrl,
        success: true,
      };
    } catch (error) {
      console.error(`Error processing file ${file.originalname}:`, error);
      return {
        originalName: file.originalname,
        success: false,
        error: error.message,
      };
    }
  });

  try {
    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);

    // Count successful uploads
    const successfulUploads = uploadResults.filter((result) => result.success);
    
    // If at least one file was uploaded successfully, update the CP model
    if (successfulUploads.length > 0) {
      try {
        // Find the CP document by userId and update portfolioFileUploaded to true
        const cp = await CP.findOne({ userId });
        if (cp) {
          cp.portfolioFileUploaded = true;
          await cp.save();
          console.log(`Updated portfolioFileUploaded to true for CP with userId: ${userId}`);
        } else {
          console.error(`CP not found for userId: ${userId}`);
        }
      } catch (cpError) {
        console.error(`Error updating CP model for userId ${userId}:`, cpError);
        // Continue with the response even if CP update fails
      }
    }

    // Return the results
    return res.status(httpStatus.OK).json({
      success: true,
      message: `Successfully uploaded ${successfulUploads.length} of ${uploadResults.length} files`,
      files: uploadResults,
      portfolioUpdated: successfulUploads.length > 0
    });
  } catch (error) {
    console.error("Error processing file uploads:", error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error processing file uploads",
      error: error.message,
    });
  }
});

// Content fetch
const getCpsContent = catchAsync(async (req, res) => {
  const { userId, contentType } = req.params;
  const results = await gcpFileService.getCpsContent(userId, contentType);
  return res.json(results);
});

const deleteCpsContent = catchAsync(async (req, res) => {
  const { filePaths } = req.body;
  const result = await gcpFileService.deleteCpsContent(filePaths);
  return res.json(result);
});

// Get recent files with optional user filtering
const getRecentFiles = catchAsync(async (req, res, next) => {
  try {
    // Get the user_id from query parameters
    const requestedUserId = req.query.user_id;

    // If no user_id provided, check if we should return all files or error
    if (!requestedUserId) {
      console.log("No user_id provided in request");
      // For simplicity, we'll return all files if no user_id is provided
      // You can modify this behavior as needed
      const allRecentFiles = await gcpFileService.getRecentFiles(null);
      return res.json(allRecentFiles);
    }

    // Get user info to check role
    let role = "user";
    try {
      const userInfo = await userService.getUserById(requestedUserId);
      role = userInfo.role;
      console.log(`User ${requestedUserId} has role: ${role}`);
    } catch (error) {
      console.log(
        "Could not get user role, defaulting to regular user",
        requestedUserId,
        "error-",
        error.message
      );
    }

    // Call the service with the appropriate user_id
    const recentFiles = await gcpFileService.getRecentFiles(
      role === "admin" || role === "post_production_manager"
        ? null
        : requestedUserId
    );
    console.log(
      `Found ${recentFiles.length} files for user ${requestedUserId}`
    );
    return res.json(recentFiles.length > 0 ? recentFiles : "no files found");
  } catch (error) {
    console.error("Error fetching recent files:", error);
    return next(error);
  }
});

const getCpContent = catchAsync(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const results = await gcpFileService.getCpContent(userId);
  return res.json(results);
});

// Callback endpoint - called after frontend successfully uploads file to GCS
const fileUploadComplete = catchAsync(async (req, res) => {
  try {
    const { filepath, fileContentType, fileSize, fileName } = req.body;

    // Extract userId from authenticated user
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(httpStatus.UNAUTHORIZED).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!filepath) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'filepath is required'
      });
    }

    console.log('💾 File upload complete callback:', {
      filepath,
      userId,
      fileSize,
      fileContentType
    });

    // Remove folder prefix if present for database storage
    let cleanPath = filepath;
    if (filepath.startsWith('Website_Shoots_Flow/')) {
      cleanPath = filepath.replace(/^Website_Shoots_Flow\//, '');
    } else if (filepath.startsWith('shoots/')) {
      cleanPath = filepath.replace(/^shoots\//, '');
    }

    // Extract file name from path if not provided
    const finalFileName = fileName || cleanPath.split('/').pop();

    // Get parent folder path to check for cpIds and orderId metadata
    const pathParts = cleanPath.split('/').filter(Boolean);
    let folderMetadata = { cpIds: [], orderId: null };

    if (pathParts.length > 1) {
      // File is inside a folder, try to get folder's metadata
      const folderPath = pathParts.slice(0, -1).join('/') + '/';

      const { FileMeta } = require('../models');

      // First check FileMeta database for folder metadata
      const parentFolder = await FileMeta.findOne({
        path: folderPath,
        isFolder: true
      });

      if (parentFolder && parentFolder.metadata) {
        folderMetadata.cpIds = parentFolder.metadata.cpIds || [];
        folderMetadata.orderId = parentFolder.metadata.orderId || null;
        console.log('📁 Found folder metadata from database:', folderMetadata);
      } else {
        // Try to get metadata from GCS folder
        try {
          const gcsFolder = gcpFileService.bucket.file(`Website_Shoots_Flow/${folderPath}`);
          const [exists] = await gcsFolder.exists();

          if (exists) {
            const [gcsFolderMetadata] = await gcsFolder.getMetadata();

            if (gcsFolderMetadata.metadata) {
              // Parse createdBy (cpIds)
              if (gcsFolderMetadata.metadata.createdBy) {
                try {
                  const createdBy = JSON.parse(gcsFolderMetadata.metadata.createdBy);
                  if (Array.isArray(createdBy)) {
                    folderMetadata.cpIds = createdBy.map(id => ({ id: id }));
                  }
                } catch (e) {
                  console.error('Error parsing createdBy:', e);
                }
              }

              // Parse orderId
              if (gcsFolderMetadata.metadata.orderId) {
                try {
                  folderMetadata.orderId = JSON.parse(gcsFolderMetadata.metadata.orderId);
                } catch (e) {
                  console.error('Error parsing orderId:', e);
                }
              }

              console.log('📁 Found folder metadata from GCS:', folderMetadata);
            }
          }
        } catch (gcsError) {
          console.error('Error getting GCS folder metadata:', gcsError);
        }
      }
    }

    // Check if file already exists in database
    const { FileMeta } = require('../models');
    const existingFile = await FileMeta.findOne({
      path: cleanPath
    });

    // Fetch uploader's name for the author field
    let authorName = 'Unknown';
    try {
      const uploaderInfo = await userService.getUserById(userId);
      if (uploaderInfo) {
        authorName = uploaderInfo.name || uploaderInfo.email || 'Unknown';
      }
    } catch (e) {
      console.log('⚠️ Could not fetch uploader name:', e.message);
    }

    if (existingFile) {
      // Update existing file metadata
      existingFile.size = fileSize || 0;
      existingFile.contentType = fileContentType || 'application/octet-stream';
      existingFile.updatedAt = new Date();
      // Update metadata with folder's cpIds and orderId
      existingFile.metadata = {
        ...existingFile.metadata,
        cpIds: folderMetadata.cpIds,
        orderId: folderMetadata.orderId
      };
      // Set author if not already set
      if (!existingFile.author || existingFile.author === 'Unknown') {
        existingFile.author = authorName;
      }
      await existingFile.save();

      console.log('✅ Updated existing file metadata:', existingFile._id);

      // Auto-upload video to Frame.io if not already linked (non-blocking)
      if (fileContentType && fileContentType.startsWith('video/') && !existingFile.frameioAssetId) {
        const { frameioService } = require('../services');
        const fullGcpPath = filepath.startsWith('Website_Shoots_Flow/') ? filepath :
                           filepath.startsWith('shoots/') ? filepath : `Website_Shoots_Flow/${filepath}`;
        frameioService.autoUploadAndLink(
          fullGcpPath,
          existingFile.name,
          fileSize || 0,
          existingFile._id.toString(),
          userId,
          fileContentType
        ).catch(err => console.error('Frame.io auto-upload background error:', err.message));
      }

      return res.status(200).json({
        success: true,
        message: 'File metadata updated',
        file: {
          id: existingFile._id.toString(),
          path: existingFile.path,
          name: existingFile.name,
          size: existingFile.size
        }
      });
    }

    // Create new file metadata in database
    // Include cpIds and orderId from parent folder for access control
    const fileDoc = await FileMeta.create({
      path: cleanPath,
      name: finalFileName,
      userId: userId,
      isFolder: false,
      contentType: fileContentType || 'application/octet-stream',
      size: fileSize || 0,
      isPublic: false,
      author: authorName,
      fullPath: filepath.startsWith('Website_Shoots_Flow/') ? filepath :
                filepath.startsWith('shoots/') ? filepath : `Website_Shoots_Flow/${filepath}`,
      metadata: {
        cpIds: folderMetadata.cpIds,
        orderId: folderMetadata.orderId
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('✅ Created file metadata in database:', fileDoc._id);

    // Auto-upload video to Frame.io (non-blocking)
    if (fileContentType && fileContentType.startsWith('video/')) {
      const { frameioService } = require('../services');
      const fullGcpPath = filepath.startsWith('Website_Shoots_Flow/') ? filepath :
                         filepath.startsWith('shoots/') ? filepath : `Website_Shoots_Flow/${filepath}`;
      frameioService.autoUploadAndLink(
        fullGcpPath,
        finalFileName,
        fileSize || 0,
        fileDoc._id.toString(),
        userId,
        fileContentType
      ).catch(err => console.error('Frame.io auto-upload background error:', err.message));
    }

    return res.status(httpStatus.CREATED).json({
      success: true,
      message: 'File metadata saved successfully',
      file: {
        id: fileDoc._id.toString(),
        path: fileDoc.path,
        name: fileDoc.name,
        size: fileDoc.size,
        contentType: fileDoc.contentType,
        isFolder: false
      }
    });

  } catch (error) {
    console.error('❌ Error saving file metadata:', error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'server-error',
      message: error.message
    });
  }
});

// Get folder counts for workflow tabs (Pre-Production, Work in Progress, Final Delivery)
const getFolderCounts = catchAsync(async (req, res, next) => {
  try {
    const { userId, folderPath } = req.params;

    console.log('📊 GET /gcp/folder-counts/:userId/:folderPath');
    console.log('   User ID:', userId);
    console.log('   Folder Path:', folderPath);

    // Get role for the user
    let role = 'user';
    let userName = 'Unknown';
    try {
      const userInfo = await userService.getUserById(userId);
      role = userInfo.role;
      userName = userInfo.name || userInfo.email;
      console.log('   User Name:', userName);
      console.log('   User Role:', role);
    } catch (error) {
      console.log('⚠️  Could not get user role, defaulting to regular user');
    }

    // Decode the folder path
    const decodedPath = decodeURIComponent(folderPath);
    console.log('   Decoded Path:', decodedPath);

    // Get folder counts from service
    const counts = await gcpFileService.getFolderCounts(decodedPath, userId, role);

    // Add metadata to response
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      user: {
        id: userId,
        name: userName,
        role: role
      },
      folder: {
        path: decodedPath,
        name: counts.rootFolder?.name || decodedPath.split('/').pop()
      },
      counts: counts,
      summary: {
        totalFiles: counts.all,
        preProduction: counts['pre-production']?.count || 0,
        postProduction: counts['post-production']?.count || 0,
        workInProgress: counts['work-in-progress']?.count || 0,
        finalDelivery: counts['final-delivery']?.count || 0,
        totalSize: counts.rootFolder?.totalSizeFormatted || '0 B'
      }
    };

    console.log('✅ Folder counts retrieved successfully');
    return res.json(response);
  } catch (error) {
    console.error('❌ Error getting folder counts:', error);
    return next(error);
  }
});

// Get all files recursively from a client folder (for "All Files" tab)
const getAllFilesRecursive = catchAsync(async (req, res, next) => {
  try {
    const { userId, folderPath } = req.params;
    const { search, fileType, sortBy, sortOrder, stage } = req.query;

    console.log('📂 GET /gcp/all-files/:userId/:folderPath');
    console.log('   User ID:', userId);
    console.log('   Folder Path:', folderPath);
    console.log('   Filters:', { search, fileType, sortBy, sortOrder, stage });

    // Get role for the user
    let role = 'user';
    let userName = 'Unknown';
    try {
      const userInfo = await userService.getUserById(userId);
      role = userInfo.role;
      userName = userInfo.name || userInfo.email;
      console.log('   User Name:', userName);
      console.log('   User Role:', role);
    } catch (error) {
      console.log('⚠️  Could not get user role, defaulting to regular user');
    }

    // Decode the folder path
    const decodedPath = decodeURIComponent(folderPath);
    console.log('   Decoded Path:', decodedPath);

    // Get all files recursively from service with filters
    const filters = { search, fileType, sortBy, sortOrder, stage };
    const result = await gcpFileService.getAllFilesRecursive(decodedPath, userId, role, filters);

    // Add metadata to response
    const response = {
      success: result.success,
      timestamp: new Date().toISOString(),
      user: {
        id: userId,
        name: userName,
        role: role
      },
      folder: {
        path: decodedPath,
        name: decodedPath.split('/').pop()
      },
      files: result.files,
      totalCount: result.totalCount,
      unfilteredCount: result.unfilteredCount,
      error: result.error
    };

    console.log(`✅ Retrieved ${result.totalCount} files`);
    return res.json(response);
  } catch (error) {
    console.error('❌ Error getting all files recursively:', error);
    return next(error);
  }
});

// Move files to Final Deliverables (Admin only)
// This endpoint moves files from Edited Footage to Final Deliverables folder
const moveToFinalDeliverables = catchAsync(async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const user = await getUserInfoFromToken(authHeader);
    const { role } = user;

    // Check if user is admin or post_production_manager
    if (role !== "admin" && role !== "post_production_manager") {
      return res.status(403).json({
        success: false,
        message: "Only admins can move files to Final Deliverables"
      });
    }

    const { filePaths, clientFolder } = req.body;

    // Validate request body
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({
        success: false,
        message: "filePaths array is required"
      });
    }

    if (!clientFolder) {
      return res.status(400).json({
        success: false,
        message: "clientFolder is required"
      });
    }

    console.log('📁 Moving files to Final Deliverables:', {
      user: user.email || user.id,
      role,
      clientFolder,
      fileCount: filePaths.length
    });

    const { FileMeta } = require('../models');
    const results = [];
    const errors = [];

    // Define the destination folder path
    const destinationBase = `Website_Shoots_Flow/${clientFolder}/postproduction/Final Deliverables/`;

    // Ensure destination folder exists in GCS
    const destFolder = gcpFileService.bucket.file(destinationBase);
    const [destExists] = await destFolder.exists();
    if (!destExists) {
      // Create the Final Deliverables folder if it doesn't exist
      await destFolder.save('');
      console.log('📁 Created Final Deliverables folder:', destinationBase);

      // Also create in database
      await FileMeta.findOneAndUpdate(
        { path: `${clientFolder}/postproduction/Final Deliverables/` },
        {
          path: `${clientFolder}/postproduction/Final Deliverables/`,
          name: 'Final Deliverables',
          isFolder: true,
          fullPath: destinationBase,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    // Process each file
    for (const sourcePath of filePaths) {
      try {
        // Construct full source path with shoots prefix
        const fullSourcePath = sourcePath.startsWith('shoots/')
          ? sourcePath
          : `shoots/${sourcePath}`;

        // Extract filename from path
        const fileName = sourcePath.split('/').pop();

        // Construct destination path
        const destinationPath = `${destinationBase}${fileName}`;

        console.log('📂 Moving file:', {
          from: fullSourcePath,
          to: destinationPath
        });

        // Check if source file exists
        const sourceFile = gcpFileService.bucket.file(fullSourcePath);
        const [sourceExists] = await sourceFile.exists();

        if (!sourceExists) {
          errors.push({
            sourcePath,
            error: "Source file not found"
          });
          continue;
        }

        // Check if destination already exists
        const destFile = gcpFileService.bucket.file(destinationPath);
        const [destFileExists] = await destFile.exists();

        if (destFileExists) {
          errors.push({
            sourcePath,
            error: "File already exists in Final Deliverables"
          });
          continue;
        }

        // Check if source was public
        const [wasPublic] = await sourceFile.isPublic();

        // Move the file in GCS
        await sourceFile.move(destinationPath);

        // Restore public status if it was public
        if (wasPublic) {
          await gcpFileService.bucket.file(destinationPath).makePublic();
        }

        // Update database - remove old path, add new path
        // First, find the old file entry
        const cleanSourcePath = sourcePath.replace(/^shoots\//, '');
        const cleanDestPath = destinationPath.replace(/^shoots\//, '');

        // Update or create the file metadata in database
        await FileMeta.findOneAndUpdate(
          { path: cleanSourcePath },
          {
            path: cleanDestPath,
            fullPath: destinationPath,
            updatedAt: new Date()
          },
          { new: true }
        );

        console.log('✅ File moved successfully:', fileName);

        results.push({
          sourcePath,
          destinationPath: cleanDestPath,
          fileName,
          success: true
        });
      } catch (fileError) {
        console.error('❌ Error moving file:', sourcePath, fileError);
        errors.push({
          sourcePath,
          error: fileError.message || "Failed to move file"
        });
      }
    }

    return res.json({
      success: true,
      message: `Moved ${results.length} of ${filePaths.length} files to Final Deliverables`,
      moved: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('❌ Error in moveToFinalDeliverables:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to move files to Final Deliverables"
    });
  }
});

// Upload chat file directly to GCP (with file buffer)
const uploadChatFileToGcp = catchAsync(async (req, res, next) => {
  try {
    // Check if GCP is available
    if (!gcpFileService.isGcpAvailable()) {
      return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        error: 'GCP Storage is not configured'
      });
    }

    // Check if file was uploaded via multer
    if (!req.file) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { roomId, senderId } = req.body;

    if (!roomId || !senderId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Missing roomId or senderId'
      });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip', 'application/x-rar-compressed'
    ];

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        error: 'File type not allowed'
      });
    }

    // Limit file size (10MB)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        error: 'File too large (max 10MB)'
      });
    }

    // Upload to GCP
    const result = await gcpFileService.uploadChatFileBuffer(
      req.file.buffer,
      roomId,
      req.file.originalname,
      req.file.mimetype,
      senderId
    );

    return res.json({
      success: true,
      fileUrl: result.fileUrl,
      fileName: result.fileName,
      fileType: result.fileType,
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('Error uploading chat file to GCP:', error);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: error.message || 'Failed to upload file'
    });
  }
});

// Get folder categories for custom folder creation
const getCategories = catchAsync(async (req, res) => {
  try {
    // Return default folder categories
    // These can be customized or loaded from database/config as needed
    const categories = [
      "Pre-Production",
      "Post-Production",
      "Raw Footage",
      "Edited Footage",
      "Final Deliverables",
      "Client Review",
      "Archive",
      "Other"
    ];

    return res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error("Error getting categories:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get categories"
    });
  }
});

/**
 * Get files for a specific order's pre/post production folder
 * Bypasses user filtering - both CP and Client can see all files for their orders
 * @route GET /gcp/order-files/:orderId
 * @query {String} folderType - 'pre' or 'post'
 * @query {String} path - Optional subpath within the order folder
 */
const getOrderFilesForPrePost = catchAsync(async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { folderType = 'pre', path = '' } = req.query;

    console.log('📂 GET /gcp/order-files/:orderId', { orderId, folderType, path });

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const result = await gcpFileService.getOrderFilesForPrePost(orderId, folderType, path);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("❌ Error fetching order files:", error);
    return next(error);
  }
});

module.exports = {
  getFiles,
  getChatFiles,
  downloadFolder,
  setPublic,
  setPrivate,
  getShareUrl,
  getNewUploadPolicy: uploadFileAndUploadPollicy,
  uploadChatFiles,
  addFolder,
  deleteFile,
  moveFile,
  moveToFinalDeliverables,
  getSettings,
  saveSettings,
  uploadProfilePicture,
  makeFilePublic,
  uploadCpsContent,
  getCpsContent,
  deleteCpsContent,
  getRecentFiles,
  getCpContent,
  fileUploadComplete,
  getFolderCounts,
  getAllFilesRecursive,
  uploadChatFileToGcp,
  getCategories,
  getOrderFilesForPrePost
};
