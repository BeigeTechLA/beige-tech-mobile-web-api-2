const express = require('express');
const googleReviewController = require('../../controllers/googleReview.controller');

const router = express.Router();

router.route('/')
  .get(googleReviewController.getGoogleReviews);

module.exports = router;
