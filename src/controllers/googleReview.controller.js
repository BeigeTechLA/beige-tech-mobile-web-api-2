const catchAsync = require('../utils/catchAsync');
const googleReviewService = require('../services/googleReview.service');
const pick = require('../utils/pick');

/**
 * Get Google reviews for a business
 * @route GET /v1/google-reviews
 */
const getGoogleReviews = catchAsync(async (req, res) => {
  const options = pick(req.query, ['placeId', 'limit', 'random']);
  
  // Convert limit to number if it's a string
  if (options.limit) {
    options.limit = parseInt(options.limit, 10);
  }
  
  // Convert random to boolean if it's a string
  if (options.random) {
    options.random = options.random === 'true';
  }
  
  const reviews = await googleReviewService.getGoogleReviews(options);
  
  res.send({
    success: true,
    data: reviews
  });
});

module.exports = {
  getGoogleReviews
};
