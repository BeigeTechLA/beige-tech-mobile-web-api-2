/**
 * Frame.io Routes
 * Routes for Frame.io video integration
 */

const express = require("express");
const frameioController = require("../../controllers/frameio.controller");
const auth = require("../../middlewares/auth");

const router = express.Router();

// OAuth routes (no auth required)
router.get("/oauth/authorize", frameioController.getAuthorizationUrl);
router.get("/oauth/callback", frameioController.handleOAuthCallback);

// Public test endpoint (no auth required for testing)
router.get("/test", frameioController.testConnection);

// Debug upload test endpoint
router.get("/debug-upload", frameioController.debugUpload);

// All routes below require authentication
router.use(auth());

// Get Frame.io projects
router.get("/projects", frameioController.getProjects);

// Get assets in a project/folder
router.get("/assets/:parentId", frameioController.getAssets);

// Get specific asset details
router.get("/asset/:assetId", frameioController.getAsset);

// Get or create review link for an asset
router.post("/review-link", frameioController.getOrCreateReviewLink);

// Link Frame.io asset to file
router.post("/link", frameioController.linkAsset);

// Unlink Frame.io asset from file
router.delete("/unlink/:fileMetaId", frameioController.unlinkAsset);

// Get Frame.io status for a file
router.get("/status/:fileMetaId", frameioController.getFrameioStatus);

// Retry Frame.io upload for a failed file
router.post("/retry/:fileMetaId", frameioController.retryUpload);

// Get Frame.io comments for an asset
router.get("/comments/:assetId", frameioController.getFrameioComments);

// Create a comment on Frame.io (and save locally)
router.post("/comments", frameioController.createComment);

// Sync Frame.io comments to local database
router.post("/sync-comments/:fileMetaId", frameioController.syncFrameioComments);

module.exports = router;
