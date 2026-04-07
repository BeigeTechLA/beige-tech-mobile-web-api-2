const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { reviewRequestService } = require('../services');
const pick = require('../utils/pick');

/**
 * Create a review request
 * POST /review-request
 */
const createReviewRequest = catchAsync(async (req, res) => {
  const reviewRequest = await reviewRequestService.createReviewRequest(req.body);
  res.status(httpStatus.CREATED).send(reviewRequest);
});

/**
 * Get review requests for a user
 * GET /review-request/user/:userId
 */
const getReviewRequestsByUser = catchAsync(async (req, res) => {
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await reviewRequestService.getReviewRequestsByUser(req.params.userId, options);
  res.send(result);
});

/**
 * Get review requests sent by a CP
 * GET /review-request/cp/:cpId
 */
const getReviewRequestsByCp = catchAsync(async (req, res) => {
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await reviewRequestService.getReviewRequestsByCp(req.params.cpId, options);
  res.send(result);
});

/**
 * Respond to a review request (accept or reject)
 * POST /review-request/:id/respond
 */
const respondToReviewRequest = catchAsync(async (req, res) => {
  const reviewRequest = await reviewRequestService.updateReviewRequestStatus(req.params.id, { status: req.body.status });
  res.send(reviewRequest);
});

/**
 * Get all review requests (admin)
 * GET /review-request/all
 */
const getAllReviewRequests = catchAsync(async (req, res) => {
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await reviewRequestService.getAllReviewRequests(options);
  res.send(result);
});

module.exports = {
  createReviewRequest,
  getReviewRequestsByUser,
  getReviewRequestsByCp,
  respondToReviewRequest,
  getAllReviewRequests,
};
