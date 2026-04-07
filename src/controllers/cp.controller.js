const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { cpService } = require("../services");
const transactionService = require("../services/transaction.service");

const createCP = catchAsync(async (req, res) => {
  const cp = await cpService.createCP(req.body);
  res.status(httpStatus.CREATED).send(cp);
});

const getCPs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["city", "search"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await cpService.queryCPs(filter, options);
  res.send(result);
});

const getCP = catchAsync(async (req, res) => {
  const cp = await cpService.getCpById(req.params.cpId);
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }
  res.send(cp);
});

const getCpByUserId = catchAsync(async (req, res) => {
  const cp = await cpService.getCpById(req.params.userId);
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }
  res.send(cp);
});

/**
 * Updates a CP document by user ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 * @throws {ApiError} If an error occurs while updating the CP document.
 */
const updateCpByUserId = catchAsync(async (req, res) => {
  const cp = await cpService.updateCpByUserId(req.params.userId, req.body);
  res.send(cp);
});

// Update cp's profile by admin

const updateCpByAdmin = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.query;
  // Check if the role is "admin"
  if (role && role.toLowerCase() === "admin") {
    const cp = await cpService.updateCpByUserId(userId, req.body);
    return res.status(200).json(cp);
  } else {
    return res
      .status(403)
      .json({ error: "Access denied. Invalid or missing role." });
  }
});

/**
 * Deletes a CP document by user ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 * @throws {ApiError} If an error occurs while deleting the CP document.
 */
const deleteCpByUserId = catchAsync(async (req, res) => {
  await cpService.deleteCpByUserId(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateCP = catchAsync(async (req, res) => {
  const cp = await cpService.updateCpById(req.params.cpId, req.body);
  res.send(cp);
});

const deleteCp = catchAsync(async (req, res) => {
  await cpService.deleteCpById(req.params.cpId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get CP with detailed user data by ID
 * @route GET /cp/detail/:cpId
 * @param {Object} req - Request object with cpId in params
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
const getCpWithUserData = catchAsync(async (req, res) => {
  const { cpId } = req.params;

  if (!cpId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'CP ID is required');
  }

  const cp = await cpService.getCpWithUserData(cpId);
  res.send(cp);
});

/**
 * Find CPs by content type and budget with ranking filters
 * @route GET /cp/search
 * @query {String} contentType - Content type: 'photo', 'video', or 'both'
 * @query {String} budget - Budget as string '10-50' or JSON array [10, 50]
 * @query {Number} lat - User's latitude for distance calculation (optional)
 * @query {Number} lng - User's longitude for distance calculation (optional)
 * @query {Number} maxDistance - Maximum distance in kilometers (optional, default: 50)
 * @query {Number} minRating - Minimum average rating (optional, 0-5)
 * @query {Number} minAcceptanceRate - Minimum acceptance rate (optional, 0-100)
 * @query {Number} minTrustScore - Minimum trust/reliability score (optional, 0-100)
 * @query {String} tier - Minimum tier (optional: bronze, silver, gold, platinum)
 * @query {Number} maxInactiveDays - Maximum days since last activity (optional)
 * @query {String} sortBy - Sort field (optional: ranking, distance, rating, acceptanceRate, trustScore)
 * @query {String} sortOrder - Sort order (optional: asc, desc - default: desc)
 */
const findCpsByContentAndBudget = catchAsync(async (req, res) => {
  const {
    contentType,
    budget,
    lat,
    lng,
    maxDistance,
    minRating,
    minAcceptanceRate,
    minTrustScore,
    tier,
    maxInactiveDays,
    sortBy,
    sortOrder
  } = req.query;

  if (!contentType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Content type is required');
  }

  if (!budget) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Budget is required');
  }

  // budget format: "100-500"
  const [minBudget, maxBudget] = budget.split('-').map(Number);

  if (isNaN(minBudget) || isNaN(maxBudget)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Budget must be in format min-max'
    );
  }

  // Validate lat/lng if provided
  if ((lat && !lng) || (!lat && lng)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Both latitude and longitude are required for distance filtering'
    );
  }

  if (lat && (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng)))) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid latitude or longitude values'
    );
  }

  // Build filter options
  const filterOptions = {
    contentType,
    minBudget,
    maxBudget,
    lat: lat ? parseFloat(lat) : null,
    lng: lng ? parseFloat(lng) : null,
    maxDistance: maxDistance ? parseFloat(maxDistance) : 40, // default 25 miles (40km)
    minRating: minRating ? parseFloat(minRating) : null,
    minAcceptanceRate: minAcceptanceRate ? parseFloat(minAcceptanceRate) : null,
    minTrustScore: minTrustScore ? parseFloat(minTrustScore) : null,
    tier: tier || null,
    maxInactiveDays: maxInactiveDays ? parseInt(maxInactiveDays) : null,
    sortBy: sortBy || 'ranking',
    sortOrder: sortOrder || 'desc'
  };

  const result = await cpService.findCpsByContentAndBudgetWithRanking(filterOptions);

  res.status(httpStatus.OK).send({
    success: true,
    count: result.length,
    data: result,
  });
});

/**
 * Update CP location (geo_location and city)
 * @route PATCH /cp/:userId/location
 * @param {Object} req - Request with userId in params and geo_location/city in body
 * @param {Object} res - Response object
 */
const updateCpLocation = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { geo_location, city } = req.body;

  // Validate geo_location structure
  if (geo_location) {
    if (geo_location.type !== 'Point') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'geo_location type must be "Point"');
    }
    if (!Array.isArray(geo_location.coordinates) || geo_location.coordinates.length !== 2) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'geo_location coordinates must be an array of [longitude, latitude]');
    }
    const [lng, lat] = geo_location.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'geo_location coordinates must be numbers');
    }
    if (lng < -180 || lng > 180) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Longitude must be between -180 and 180');
    }
    if (lat < -90 || lat > 90) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Latitude must be between -90 and 90');
    }
  }

  const updateBody = {};
  if (geo_location) {
    updateBody.geo_location = geo_location;
  }
  if (city) {
    updateBody.city = city;
  }

  const cp = await cpService.updateCpByUserId(userId, updateBody);
  res.send(cp);
});

/**
 * Get CP transaction summary
 * Returns: total transaction amount, earnings from last month, and available balance
 * @route GET /cp/transaction-summary
 * @access Private (authenticated CP users)
 */
const getCpTransactionSummary = catchAsync(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Authentication required");
  }

  // Get userId from authenticated user
  const userId = req.user.id;

  // Validate userId is a valid ObjectId
  const mongoose = require("mongoose");
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID format");
  }

  // Validate date formats if provided
  let dateFrom, dateTo;
  if (req.query.dateFrom) {
    dateFrom = new Date(req.query.dateFrom);
    if (isNaN(dateFrom.getTime())) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dateFrom format. Use ISO format (YYYY-MM-DD)");
    }
  }

  if (req.query.dateTo) {
    dateTo = new Date(req.query.dateTo);
    if (isNaN(dateTo.getTime())) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dateTo format. Use ISO format (YYYY-MM-DD)");
    }
  }

  // Validate date range
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ApiError(httpStatus.BAD_REQUEST, "dateFrom must be before or equal to dateTo");
  }

  // Calculate last month's date range if not provided
  const now = new Date();
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const filter = {
    dateFrom: dateFrom || firstDayLastMonth,
    dateTo: dateTo || lastDayLastMonth,
  };

  // Get transaction summary
  const summary = await transactionService.getTransactionSummary(userId, filter);

  res.status(httpStatus.OK).send({
    success: true,
    data: {
      totalTransactionAmount: summary.totalTransactions || 0,
      earningLastMonth: summary.earningLastMonth || 0,
      availableBalance: summary.availableBalance || 0,
    },
  });
});

module.exports = {
  createCP,
  getCPs,
  getCP,
  getCpByUserId,
  updateCpByUserId,
  updateCpByAdmin,
  deleteCpByUserId,
  updateCP,
  deleteCp,
  getCpWithUserData,
  findCpsByContentAndBudget,
  getCpTransactionSummary,
  updateCpLocation,
};
