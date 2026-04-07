const express = require("express");
const disputeController = require("../../controllers/dispute.controller");
const auth = require("../../middlewares/auth");
const { checkUserPermission } = require("../../middlewares/permissions");
const multer = require("multer");

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

router
  .route("/")
  .get(checkUserPermission(["disputes_page"]),disputeController.getDisputes)
  .post(upload.array('files', 5), disputeController.createDispute);

router
  .route("/:id")
  .get(disputeController.getDisputeById)
  .patch(disputeController.updateDisputeById)
  .delete(disputeController.deleteDisputeById);

router.route("/order/:id").get(disputeController.getDisputesByOrderId);

router.route("/user/:id").get(disputeController.getDisputesByUserId);

module.exports = router;
