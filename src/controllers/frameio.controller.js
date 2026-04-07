/**
 * Frame.io Controller
 * Handles HTTP requests for Frame.io integration
 */

const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { frameioService } = require("../services");

/**
 * Get OAuth authorization URL - redirects user to Adobe login
 * @route GET /v1/frameio/oauth/authorize
 */
const getAuthorizationUrl = catchAsync(async (req, res) => {
  const authUrl = frameioService.getAuthorizationUrl();
  res.redirect(authUrl);
});

/**
 * Handle OAuth callback from Adobe
 * @route GET /v1/frameio/oauth/callback
 */
const handleOAuthCallback = catchAsync(async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(httpStatus.BAD_REQUEST).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">Authorization Failed</h1>
          <p>${error_description || error}</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(httpStatus.BAD_REQUEST).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">Authorization Failed</h1>
          <p>No authorization code received.</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }

  try {
    await frameioService.exchangeCodeForToken(code);

    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #27ae60;">✅ Frame.io Connected!</h1>
          <p>Frame.io has been successfully authorized.</p>
          <p>You can close this window now.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(httpStatus.BAD_REQUEST).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">Authorization Failed</h1>
          <p>${err.message}</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }
});

/**
 * Test Frame.io API connection
 * @route GET /v1/frameio/test
 */
const testConnection = catchAsync(async (req, res) => {
  const result = await frameioService.testConnection();
  res.status(httpStatus.OK).json(result);
});

/**
 * Get Frame.io projects
 * @route GET /v1/frameio/projects
 */
const getProjects = catchAsync(async (req, res) => {
  const projects = await frameioService.getProjects();
  res.status(httpStatus.OK).json({ success: true, projects });
});

/**
 * Get Frame.io assets in a folder/project
 * @route GET /v1/frameio/assets/:parentId
 */
const getAssets = catchAsync(async (req, res) => {
  const { parentId } = req.params;
  const assets = await frameioService.getAssetsInFolder(parentId);
  res.status(httpStatus.OK).json({ success: true, assets });
});

/**
 * Get Frame.io asset details
 * @route GET /v1/frameio/asset/:assetId
 */
const getAsset = catchAsync(async (req, res) => {
  const { assetId } = req.params;
  const asset = await frameioService.getAsset(assetId);
  res.status(httpStatus.OK).json({ success: true, asset });
});

/**
 * Link Frame.io asset to file
 * @route POST /v1/frameio/link
 * @body {string} fileMetaId - FileMeta document ID
 * @body {string} frameioAssetId - Frame.io asset ID
 */
const linkAsset = catchAsync(async (req, res) => {
  const { fileMetaId, frameioAssetId } = req.body;
  const userId = req.user?.id;

  if (!fileMetaId || !frameioAssetId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "fileMetaId and frameioAssetId are required",
    });
  }

  const result = await frameioService.linkAssetToFile(
    fileMetaId,
    frameioAssetId,
    userId
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: "Frame.io asset linked successfully",
    file: result,
  });
});

/**
 * Unlink Frame.io asset from file
 * @route DELETE /v1/frameio/unlink/:fileMetaId
 */
const unlinkAsset = catchAsync(async (req, res) => {
  const { fileMetaId } = req.params;

  const result = await frameioService.unlinkAssetFromFile(fileMetaId);

  res.status(httpStatus.OK).json({
    success: true,
    message: "Frame.io asset unlinked successfully",
    file: result,
  });
});

/**
 * Get Frame.io status for a file
 * @route GET /v1/frameio/status/:fileMetaId
 */
const getFrameioStatus = catchAsync(async (req, res) => {
  const { fileMetaId } = req.params;

  const status = await frameioService.getFrameioStatus(fileMetaId);

  res.status(httpStatus.OK).json({ success: true, ...status });
});

/**
 * Get or create review link for an asset
 * @route POST /v1/frameio/review-link
 * @body {string} assetId - Frame.io asset ID
 * @body {string} [name] - Name for the review link
 */
const getOrCreateReviewLink = catchAsync(async (req, res) => {
  const { assetId, name } = req.body;

  if (!assetId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "assetId is required",
    });
  }

  const reviewLink = await frameioService.getOrCreateReviewLink(assetId, name);

  res.status(httpStatus.OK).json({
    success: true,
    reviewLink,
  });
});

/**
 * Retry Frame.io upload for a file that previously failed
 * @route POST /v1/frameio/retry/:fileMetaId
 */
const retryUpload = catchAsync(async (req, res) => {
  const { fileMetaId } = req.params;
  const userId = req.user?.id;

  // Clear the failed status to allow retry
  frameioService.clearFailedStatus(fileMetaId);

  // Get the file status - this will trigger auto-upload if conditions are met
  const status = await frameioService.getFrameioStatus(fileMetaId);

  res.status(httpStatus.OK).json({
    success: true,
    message: "Upload retry initiated",
    ...status,
  });
});

/**
 * Auto-upload file to Frame.io after GCP upload
 * @route POST /v1/frameio/auto-upload
 * @body {string} filePath - GCP file path
 * @body {string} fileName - Original file name
 * @body {number} fileSize - File size in bytes
 * @body {string} contentType - File MIME type
 * @body {string} fileMetaId - FileMeta document ID (optional, will be created if not provided)
 */
const autoUploadToFrameio = catchAsync(async (req, res) => {
  const { filePath, fileName, fileSize, contentType, fileMetaId } = req.body;
  const userId = req.user?.id;

  if (!filePath || !fileName || !fileSize || !contentType) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "filePath, fileName, fileSize, and contentType are required",
    });
  }

  // Only upload videos to Frame.io
  if (!contentType.startsWith("video/")) {
    return res.status(httpStatus.OK).json({
      success: true,
      message: "File is not a video, skipping Frame.io upload",
      uploaded: false,
    });
  }

  try {
    // TODO: Download file from GCP to temp location
    // For now, we'll skip auto-upload and require manual linking
    // This is because we need to download the file from GCP first,
    // which requires additional logic

    return res.status(httpStatus.OK).json({
      success: true,
      message: "Auto-upload to Frame.io is not yet implemented. Please use manual linking.",
      uploaded: false,
    });
  } catch (error) {
    console.error("Auto-upload to Frame.io failed:", error);
    return res.status(httpStatus.OK).json({
      success: true,
      message: "Frame.io upload failed, but GCP upload succeeded",
      uploaded: false,
      error: error.message,
    });
  }
});

/**
 * Debug upload test - tests the V4 upload API directly
 * @route GET /v1/frameio/debug-upload
 */
const debugUpload = catchAsync(async (req, res) => {
  const axios = require("axios");

  try {
    // Clear cache if requested
    if (req.query.clearCache === "true") {
      frameioService.clearCache();
    }

    // Get test connection info
    const testResult = await frameioService.testConnection();

    if (!testResult.success) {
      return res.status(400).json({ error: "Frame.io not connected", details: testResult });
    }

    const accountId = testResult.user?.accounts?.[0]?.id || testResult.user?.id;
    const folderId = testResult.projectInfo?.rootAssetId;

    // Try to call the V4 API directly
    const client = axios.create({
      baseURL: "https://api.frame.io/v4",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Try different V4 endpoints to see what works
    const results = {
      accountId,
      folderId,
      tokenType: testResult.tokenType,
      tests: [],
    };

    // Test 1: Get all projects
    try {
      const accountsResp = await frameioService.getProjects();
      results.tests.push({
        test: "getProjects",
        success: true,
        count: accountsResp.length,
        projects: accountsResp.map(p => ({
          id: p.id,
          name: p.name,
          root_folder_id: p.root_folder_id || p.root_asset_id,
        })),
      });
    } catch (err) {
      results.tests.push({
        test: "getProjects",
        success: false,
        error: err.message,
        status: err.response?.status,
        data: err.response?.data,
      });
    }

    // Test 2: Try to create a test file (dry run info)
    results.uploadEndpoint = `/accounts/${accountId}/folders/${folderId}/files/remote_upload`;
    results.uploadBody = {
      data: {
        name: "test-file.mp4",
        source_url: "https://example.com/test.mp4",
      },
    };

    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      response: error.response?.data,
    });
  }
});

/**
 * Get Frame.io comments for an asset
 * @route GET /v1/frameio/comments/:assetId
 */
const getFrameioComments = catchAsync(async (req, res) => {
  const { assetId } = req.params;

  if (!assetId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "assetId is required",
    });
  }

  const comments = await frameioService.getFrameioComments(assetId);

  res.status(httpStatus.OK).json({
    success: true,
    comments,
    count: comments.length,
  });
});

/**
 * Sync Frame.io comments to local database
 * Fetches comments from Frame.io and saves them to our comment system
 * @route POST /v1/frameio/sync-comments/:fileMetaId
 */
const syncFrameioComments = catchAsync(async (req, res) => {
  const { fileMetaId } = req.params;
  const userId = req.user?.id;

  if (!fileMetaId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "fileMetaId is required",
    });
  }

  const syncResult = await frameioService.syncFrameioComments(fileMetaId, userId);

  res.status(httpStatus.OK).json({
    success: true,
    message: `Synced ${syncResult.comments.length} comments from Frame.io`,
    ...syncResult,
  });
});

/**
 * Create a comment on a Frame.io asset
 * Also saves the comment to local database for display
 * @route POST /v1/frameio/comments
 * @body {string} assetId - Frame.io asset ID
 * @body {string} fileMetaId - Local file meta ID
 * @body {string} text - Comment text
 * @body {number} [timestamp] - Video timestamp in seconds (optional)
 */
const createComment = catchAsync(async (req, res) => {
  const { assetId, fileMetaId, text, timestamp } = req.body;
  const userId = req.user?.id;

  if (!assetId || !text) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "assetId and text are required",
    });
  }

  // Create comment on Frame.io
  const frameioComment = await frameioService.createFrameioComment(
    assetId,
    text,
    timestamp !== undefined ? Number(timestamp) : null
  );

  // Also save to local database if fileMetaId is provided
  let localComment = null;
  if (fileMetaId && userId) {
    try {
      const FileComment = require("../models/fileComment.model");
      localComment = await FileComment.create({
        fileMetaId: fileMetaId,
        userId: userId,
        comment: text,
        timestamp: timestamp !== undefined ? Number(timestamp) : null,
        frameioCommentId: frameioComment.id,
        frameioSyncedAt: new Date(),
      });
    } catch (dbError) {
      console.error("Failed to save comment to local DB:", dbError.message);
      // Continue even if local save fails - Frame.io comment was created
    }
  }

  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Comment created on Frame.io",
    frameioComment,
    localComment,
  });
});

module.exports = {
  getAuthorizationUrl,
  handleOAuthCallback,
  testConnection,
  getProjects,
  getAssets,
  getAsset,
  linkAsset,
  unlinkAsset,
  getFrameioStatus,
  getOrCreateReviewLink,
  autoUploadToFrameio,
  retryUpload,
  debugUpload,
  getFrameioComments,
  syncFrameioComments,
  createComment,
};
