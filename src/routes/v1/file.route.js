/**
 * File Routes
 * This module defines the routes related to file handling and uploads.
 */

const express = require("express");
const router = express.Router();
const fileController = require("../../controllers/file.controller");
const upload = require("../../middlewares/upload");

//Start general purpose file API endpoint routes
router.post("/directory", fileController.createDirectory);
router.get("/directory", fileController.getDirectoryContents);
//End general purpose file API endpoint routes

router.get("/url/:file_id", fileController.getPrivateFileDownloadURL);

router.post("/upload/order", upload("file"), fileController.uploadOrderFile);

//Start resumable multi file upload API endpoint routes
router.get("/upload", fileController.getFileData);
router.post("/upload", fileController.initiateUploadRequest);
router.put("/upload", fileController.uploadFileChunk);
//End resumable multi file upload API endpoint routes

router.post("/upload/public", upload("file"), fileController.uploadPublicFile);

router.delete("/order/:order_id/:file_id", fileController.deleteOrderFile);

router.get("/order/list/:order_id/", fileController.getOrderFilesAndFolders);

router.get("/order/:order_id", fileController.getOrderFiles);

router.get("/url/:file_id", fileController.getPrivateFileDownloadURL);

router.patch("/status/path", fileController.updateReviewStatusByPath);

router.patch("/status/id", fileController.updateReviewStatusById);

// Production workflow folder permission endpoints
// Check if user can upload to a specific folder (based on folder type and role)
router.post("/permissions/upload", fileController.checkUploadPermission);

// Get folder permissions info (visibility and upload permissions)
router.get("/permissions/folder", fileController.getFolderPermissions);

module.exports = router;
