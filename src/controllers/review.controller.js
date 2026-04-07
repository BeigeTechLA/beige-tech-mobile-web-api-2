const reviewService = require("../services/review.service");
const catchAsync = require("../utils/catchAsync");
const pick = require("../utils/pick");

const createReview = async (req, res) => {
  try {
    const newReview = await reviewService.createReview(req.body);
    res.status(201).json(newReview);
  } catch (error) {
    if (error.message === "Rating, userId and cpId are required.") {
      return res.status(400).json({ message: error.message });
    }
    res
      .status(500)
      .json({ message: "Failed to create review", error: error.message });
  }
};

const getAllReviews = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const filter = pick(requestQuery, ["client_id", "order_id"]);

  // Check for "cp_id" in the query parameters
  if (requestQuery.cp_id) {
    filter.cp_ids = { $elemMatch: { id: requestQuery.cp_id } };
  }

  const options = pick(requestQuery, ["sortBy", "limit", "page", "populate"]);
  const result = await reviewService.getAllReviews(filter, options);
  res.send(result);
});

const deleteReview = catchAsync(async (req, res) => {
  const userId = req.params.userId;
  const reviewId = req.params.id;
  const deletedReview = await reviewService.deleteReview(reviewId, userId);
  if (!deletedReview) {
    return res.status(404).json({ message: "Review not found" });
  }
  res.status(204).send();
});

/**
 * Get featured reviews for frontend display (limited to 12)
 * @route GET /v1/reviews/featured
 */
const getFeaturedReviews = catchAsync(async (req, res) => {
  const result = await reviewService.getFeaturedReviews();
  res.send(result);
});

/**
 * Get top 7 content providers with highest trust score
 * @route GET /v1/reviews/top-trusted-cps
 */
const getTopTrustedCPs = catchAsync(async (req, res) => {
  const result = await reviewService.getTopTrustedCPs();
  res.send(result);
});

module.exports = {
  createReview,
  getAllReviews,
  deleteReview,
  getFeaturedReviews,
  getTopTrustedCPs,
};
