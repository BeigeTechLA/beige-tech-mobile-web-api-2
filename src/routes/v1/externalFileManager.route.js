const express = require("express");
const externalFileManagerController = require("../../controllers/externalFileManager.controller");

const router = express.Router();

const requireInternalKey = (req, res, next) => {
  const providedKey = req.headers["x-internal-key"];
  const expectedKey = process.env.INTERNAL_FILE_MANAGER_KEY || "beige-internal-dev-key";

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      message: "Invalid internal integration key",
    });
  }

  return next();
};

router.use(requireInternalKey);

router.get("/workspaces", externalFileManagerController.listWorkspaces);
router.post("/workspace", externalFileManagerController.createWorkspace);
router.get("/workspace/:externalId", externalFileManagerController.getWorkspace);
router.get("/workspace/:externalId/files", externalFileManagerController.getWorkspaceFiles);
router.post("/folder", externalFileManagerController.createFolder);
router.post("/upload-policy", externalFileManagerController.getUploadPolicy);
router.post("/file-uploaded", externalFileManagerController.completeUpload);
router.post("/file-view-url", externalFileManagerController.getFileViewUrl);
router.post("/file-download-url", externalFileManagerController.getFileDownloadUrl);
router.post("/folder-download-url", externalFileManagerController.getFolderDownloadUrl);
router.post("/delete", externalFileManagerController.deleteEntry);

module.exports = router;
