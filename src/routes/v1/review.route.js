const express = require("express");
const reviewController = require("../../controllers/review.controller");

const router = express.Router();

router
    .route("/")
    .post(reviewController.createReview)
    .get(reviewController.getAllReviews)

router
    .route("/featured")
    .get(reviewController.getFeaturedReviews);

router
    .route("/top-trusted-cps")
    .get(reviewController.getTopTrustedCPs);

router
    .route("/:id/:userId")
    .delete(reviewController.deleteReview);

module.exports = router;
