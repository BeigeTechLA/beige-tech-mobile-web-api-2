const express = require('express');
const validate = require('../../middlewares/validate');
const reviewRequestController = require('../../controllers/reviewRequest.controller');
const reviewRequestValidation = require('../../validations/reviewRequest.validation');

const router = express.Router();

router
  .route('/')
  .post(
    validate(reviewRequestValidation.createReviewRequest),
    reviewRequestController.createReviewRequest
  );

router
  .route('/user/:userId')
  .get(
    validate(reviewRequestValidation.getReviewRequestsByUser),
    reviewRequestController.getReviewRequestsByUser
  );

router
  .route('/cp/:cpId')
  .get(
    validate(reviewRequestValidation.getReviewRequestsByCp),
    reviewRequestController.getReviewRequestsByCp
  );

router
  .route('/all')
  .get(
    validate(reviewRequestValidation.getAllReviewRequests),
    reviewRequestController.getAllReviewRequests
  );

router
  .route('/:id/respond')
  .post(
    validate(reviewRequestValidation.respondToReviewRequest),
    reviewRequestController.respondToReviewRequest
  );

module.exports = router;
