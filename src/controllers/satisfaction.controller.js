const httpStatus = require('http-status');
const { satisfactionService } = require('../services');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');

/**
 * Get client satisfaction summary statistics
 */
const getClientSatisfactionSummary = catchAsync(async (req, res) => {
  const summaryData = await satisfactionService.getClientSatisfactionSummary();
  res.status(httpStatus.OK).send({
    success: true,
    data: summaryData
  });
});

/**
 * Get detailed review information with pagination
 */
const getDetailedReviews = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['rating', 'rating_type']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  const result = await satisfactionService.getDetailedReviews(filter, options);
  
  res.status(httpStatus.OK).send({
    success: true,
    data: result
  });
});

/**
 * Get completed orders without reviews
 */
const getPendingReviews = catchAsync(async (req, res) => {
  const filter = pick(req.query, []);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  const result = await satisfactionService.getPendingReviews(filter, options);
  
  res.status(httpStatus.OK).send({
    success: true,
    data: result
  });
});

module.exports = {
  getClientSatisfactionSummary,
  getDetailedReviews,
  getPendingReviews
};
