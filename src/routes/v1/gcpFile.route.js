const express = require("express");
const gcpFileController = require("../../controllers/gcpFile.controller");
const auth = require("../../middlewares/auth");
const upload = require('../../middlewares/upload');
const router = express.Router();

router.get("/get-files/:userId", auth(), gcpFileController.getFiles);
router.get("/getChatfiles", gcpFileController.getChatFiles);
router.get("/download-folder", gcpFileController.downloadFolder);
router.post("/chatFile", gcpFileController.uploadChatFiles);
// Upload chat file directly to GCP (with file buffer via multer)
router.post("/chat-upload", upload('file'), gcpFileController.uploadChatFileToGcp);
router.post("/set-public", gcpFileController.setPublic);
router.post("/set-private", gcpFileController.setPrivate);
router.post("/get-share-url", gcpFileController.getShareUrl);
router.post("/get-new-upload-policy", gcpFileController.getNewUploadPolicy);
router.post("/add-folder", auth(), gcpFileController.addFolder);
router.post("/file-uploaded", auth(), gcpFileController.fileUploadComplete);
router.post("/delete-file", gcpFileController.deleteFile);
router.post("/move-file", gcpFileController.moveFile);
// Move files to Final Deliverables (Admin only)
router.post("/move-to-final-deliverables", auth(), gcpFileController.moveToFinalDeliverables);
router.get("/get-settings", gcpFileController.getSettings);
router.post("/save-settings", gcpFileController.saveSettings);
// Personal file
router.post("/profile-image", gcpFileController.uploadProfilePicture);
router.post("/make-file-public", gcpFileController.makeFilePublic);

// Use multiple file upload middleware (up to 5 files)
router.post("/content-upload", upload.multiple('files', 10), gcpFileController.uploadCpsContent);
router.get(
  "/get-content/:userId/:contentType",
  gcpFileController.getCpsContent
);

// New endpoint for getting cp-content
router.get(
  "/get-cp-content/:userId",
  gcpFileController.getCpContent
);

router.post("/delete-content", gcpFileController.deleteCpsContent);

// Get 10 most recent uploaded files
router.get("/recent-files", gcpFileController.getRecentFiles);

// Get folder counts for workflow tabs (Pre-Production, Work in Progress, Final Delivery)
router.get("/folder-counts/:userId/:folderPath", auth(), gcpFileController.getFolderCounts);

// Get all files recursively from a client folder (for "All Files" tab)
router.get("/all-files/:userId/:folderPath", auth(), gcpFileController.getAllFilesRecursive);

// Get folder categories for custom folder creation
router.get("/categories", gcpFileController.getCategories);

// Get files for a specific order's pre/post production folder
// Both CP and Client can access all files for their orders
router.get("/order-files/:orderId", auth(), gcpFileController.getOrderFilesForPrePost);

module.exports = router;
