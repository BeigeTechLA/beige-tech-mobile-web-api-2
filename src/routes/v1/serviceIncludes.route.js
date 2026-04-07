const express = require("express");
const auth = require("../../middlewares/auth");
const validate = require("../../middlewares/validate");
const serviceIncludesValidation = require("../../validations/serviceIncludes.validation");
const serviceIncludesController = require("../../controllers/serviceIncludes.controller");

const router = express.Router();

// Protected routes (require authentication)
router
  .route("/")
  .post(
    auth("manageServiceIncludes"),
    validate(serviceIncludesValidation.createServiceIncludes),
    serviceIncludesController.createServiceIncludes
  )
  .get(
    auth("getServiceIncludes"),
    validate(serviceIncludesValidation.getServiceIncludes),
    serviceIncludesController.getServiceIncludes
  );

// Get service includes by CP ID
router
  .route("/cp/:cpId")
  .get(
    auth("getServiceIncludes"),
    validate(serviceIncludesValidation.getServiceIncludesByCpId),
    serviceIncludesController.getServiceIncludesByCpId
  );

// Individual service include operations
router
  .route("/:serviceId")
  .get(
    auth("getServiceIncludes"),
    validate(serviceIncludesValidation.getServiceInclude),
    serviceIncludesController.getServiceInclude
  )
  .patch(
    auth("manageServiceIncludes"),
    validate(serviceIncludesValidation.updateServiceInclude),
    serviceIncludesController.updateServiceInclude
  )
  .delete(
    auth("manageServiceIncludes"),
    validate(serviceIncludesValidation.deleteServiceInclude),
    serviceIncludesController.deleteServiceInclude
  );

module.exports = router;
