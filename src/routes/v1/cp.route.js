const express = require("express");
const cpController = require("../../controllers/cp.controller");
const cpRegistrationController = require("../../controllers/cpRegistration.controller");
const gcpFileController = require("../../controllers/gcpFile.controller");
const validate = require("../../middlewares/validate");
const cpRegistrationValidation = require("../../validations/cpRegistration.validation");
const cpValidation = require("../../validations/cp.validation");
const { checkUserPermission } = require("../../middlewares/permissions");
const upload = require("../../middlewares/upload");
const auth = require("../../middlewares/auth");

const router = express.Router();

// CP Registration endpoint (public - no auth required)
// router.post(
//   "/register",
//   validate(cpRegistrationValidation.registerCP),
//   cpRegistrationController.registerCreativePartner
// );

router.post(
  "/register",
  cpRegistrationController.registerCPUser
);

router.post(
  "/verify-otp",
  cpRegistrationController.verifyOTP
);

router.post(
  "/complete-registration",
  cpRegistrationController.completeCPRegistration
);

router.post(
  "/resend-otp",
  cpRegistrationController.resendOTP
);

// Get creative by email (for admin assignment)
router.get(
  "/search-by-email",
  validate(cpRegistrationValidation.getCreativeByEmail),
  cpRegistrationController.getCreativeByEmail
);

// Search CPs by content type and budget
router.get(
  "/search",
  cpController.findCpsByContentAndBudget
);

// Get CP transaction summary (total amount, last month earnings, available balance)
router.get(
  "/transaction-summary",
  auth(),
  cpController.getCpTransactionSummary
);

// Upload CP content (portfolio files)
router.post(
  "/upload",
  upload.multiple("files", 10),
  gcpFileController.uploadCpsContent
);

// Get CP content
router.get(
  "/content/:userId/:contentType",
  gcpFileController.getCpsContent
);

router.get(
  "/content/:userId",
  gcpFileController.getCpContent
);

// Delete CP content
router.post(
  "/delete-content",
  gcpFileController.deleteCpsContent
);

router.route("/").post(cpController.createCP).get(cpController.getCPs);

// Update CP location (geo_location and city)
router.route("/:userId/location").patch(cpController.updateCpLocation);

//add a route with query parameters of userId
router
  .route("/:userId")
  .get(cpController.getCpByUserId)
  .patch(cpController.updateCpByUserId)
  .delete(cpController.deleteCpByUserId);

//This route for updateCp's profile by admin
router.route("/:userId").patch(cpController.updateCpByAdmin);

router
  .route("/:cpId")
  .get(cpController.getCP)
  .patch(cpController.updateCP)
  .delete(cpController.deleteCp);

// Route to get CP with detailed user data by ID
router.route("/detail/:cpId").get(cpController.getCpWithUserData);

module.exports = router;
