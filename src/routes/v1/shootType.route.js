const express = require("express");
const auth = require("../../middlewares/auth");
const validate = require("../../middlewares/validate");
const shootTypeValidation = require("../../validations/shootType.validation");
const shootTypeController = require("../../controllers/shootType.controller");

const router = express.Router();

// Protected routes (require authentication)
router
  .route("/")
  .post(
    validate(shootTypeValidation.createShootType),
    shootTypeController.createShootType
  )
  .get(
    validate(shootTypeValidation.getShootTypes),
    shootTypeController.getShootTypes
  );

// Get shoot type by slug (protected)
router
  .route("/slug/:slug")
  .get(
    validate(shootTypeValidation.getShootTypeBySlug),
    shootTypeController.getShootTypeBySlug
  );

// Individual shoot type operations
router
  .route("/:shootTypeId")
  .get(
    validate(shootTypeValidation.getShootType),
    shootTypeController.getShootType
  )
  .patch(
    validate(shootTypeValidation.updateShootType),
    shootTypeController.updateShootType
  )
  .delete(
    validate(shootTypeValidation.deleteShootType),
    shootTypeController.deleteShootType
  );

module.exports = router;
