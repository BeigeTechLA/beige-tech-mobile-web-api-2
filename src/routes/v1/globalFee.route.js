const express = require("express");
const globalFeeController = require("../../controllers/globalFee.controller");
// const auth = require("../../middlewares/auth");
// const { checkUserPermission } = require("../../middlewares/permissions");

const router = express.Router();

// Initialize default fees (creates beige_margin and platform_fee if they don't exist)
router.route("/initialize").post(globalFeeController.initializeDefaultFees);

// Get the two required fees (beige_margin and platform_fee)
router.route("/required").get(globalFeeController.getRequiredFees);

// Base routes for CRUD operations
router
  .route("/")
  .post(
    // auth("manageGlobalFees"), // Uncomment when auth is needed
    // checkUserPermission(["create_global_fee"]), // Uncomment when permissions are set
    globalFeeController.createGlobalFee
  )
  .get(
    // auth("getGlobalFees"), // Uncomment when auth is needed
    // checkUserPermission(["view_global_fees"]), // Uncomment when permissions are set
    globalFeeController.getAllGlobalFees
  );

// Get active fees by type (must come before /:feeId to avoid route conflict)
router
  .route("/type/:feeType")
  .get(globalFeeController.getActiveFeesByType);

// Calculate fee for a booking amount
router
  .route("/:feeId/calculate")
  .post(globalFeeController.calculateFee);

// Individual fee operations
router
  .route("/:feeId")
  .get(
    // auth("getGlobalFees"), // Uncomment when auth is needed
    globalFeeController.getGlobalFeeById
  )
  .patch(
    // auth("manageGlobalFees"), // Uncomment when auth is needed
    // checkUserPermission(["update_global_fee"]), // Uncomment when permissions are set
    globalFeeController.updateGlobalFeeById
  )
  .delete(
    // auth("manageGlobalFees"), // Uncomment when auth is needed
    // checkUserPermission(["delete_global_fee"]), // Uncomment when permissions are set
    globalFeeController.deleteGlobalFeeById
  );

module.exports = router;
