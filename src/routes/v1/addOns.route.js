const express = require("express");
const addOnsController = require("../../controllers/addOns.controller");
const { checkUserPermission } = require("../../middlewares/permissions");

const router = express.Router();

router
  .route("/")
  .post(checkUserPermission(["new_add_ons"]), addOnsController.createAddOns)
  .get(
    checkUserPermission(["add_ons_page", "add_ons_fetch"]),
    addOnsController.getAllAddOns
  );

// Get all unique addon categories - must come before /:addOnId
router.get("/categories", addOnsController.getAllAddOnCategories);

router
  .route("/:addOnId")
  .patch(addOnsController.updateAddOnsById)
  .delete(addOnsController.deleteAddOnById)
  .get(checkUserPermission(["add_ons_edit"]), addOnsController.getAddOnById);

module.exports = router;
