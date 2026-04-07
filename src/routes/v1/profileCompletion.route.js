const express = require('express');
const validate = require('../../middlewares/validate');
const profileCompletionValidation = require('../../validations/profileCompletion.validation');
const profileCompletionController = require('../../controllers/profileCompletion.controller');

const router = express.Router();

router
  .route('/:cpId')
  .get(
    validate(profileCompletionValidation.getProfileCompletionStatus),
    profileCompletionController.getProfileCompletionStatus
  );

router
  .route('/bulk/check')
  .post(
    validate(profileCompletionValidation.getBulkProfileCompletionStatus),
    profileCompletionController.getBulkProfileCompletionStatus
  );

module.exports = router;
