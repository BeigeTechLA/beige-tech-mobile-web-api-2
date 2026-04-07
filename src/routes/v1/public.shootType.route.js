const express = require("express");
const validate = require("../../middlewares/validate");
const shootTypeValidation = require("../../validations/shootType.validation");
const shootTypeController = require("../../controllers/shootType.controller");

const router = express.Router();

// Public routes (no authentication required)

// Get all active shoot types
router
  .route("/shoot-types")
  .get(
    validate(shootTypeValidation.getPublicShootTypes),
    shootTypeController.getPublicShootTypes
  );

// Get shoot type by slug
router
  .route("/shoot-types/:slug")
  .get(
    validate(shootTypeValidation.getPublicShootTypeBySlug),
    shootTypeController.getPublicShootTypeBySlug
  );

module.exports = router;
