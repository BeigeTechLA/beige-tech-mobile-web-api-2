const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { statsService, subscriberService } = require("../services");

/**
 * Get summary statistics (total orders, CPs, customers, and gross total)
 * @route GET /api/public/stats/summary
 */
const getSummaryStats = catchAsync(async (req, res) => {
  const stats = await statsService.getSummaryStats();
  res.send(stats);
});

/**
 * Create a new subscriber
 * @route POST /api/public/subscribe
 */
const createSubscriber = catchAsync(async (req, res) => {
  // Validate required fields
  const requiredFields = ['full_name', 'business_name', 'email', 'phone_number', 'location'];
  for (const field of requiredFields) {
    if (!req.body[field]) {
      throw new ApiError(httpStatus.BAD_REQUEST, `${field.replace('_', ' ')} is required`);
    }
  }
  
  // Create subscriber
  const subscriber = await subscriberService.createSubscriber(req.body);
  res.status(httpStatus.CREATED).send(subscriber);
});

/**
 * Get all subscribers with pagination and search
 * @route GET /api/public/subscribers
 */
const getSubscribers = catchAsync(async (req, res) => {
  const filter = {};
  
  // Handle search parameter
  if (req.query.search) {
    const searchRegex = { $regex: req.query.search, $options: 'i' };
    filter.$or = [
      { full_name: searchRegex },
      { email: searchRegex },
      { business_name: searchRegex },
      { location: searchRegex }
    ];
  }
  
  // Set up pagination options
  const options = {
    sortBy: 'created_at:desc', // Order by latest
    limit: parseInt(req.query.limit || req.query.per_page || 10, 10),
    page: parseInt(req.query.page || 1, 10)
  };
  
  const result = await subscriberService.querySubscribers(filter, options);
  res.send(result);
});

module.exports = {
  getSummaryStats,
  createSubscriber,
  getSubscribers
};
