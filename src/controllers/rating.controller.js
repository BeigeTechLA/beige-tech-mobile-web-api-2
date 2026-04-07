/**
 Rating Controller
 */
const httpStatus = require("http-status");
const pick = require("../utils/pick");
const catchAsync = require("../utils/catchAsync");
const {ratingService, chatService} = require("../services");

/**
 Get all ratings.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with ratings data.
 */
const getRatings = catchAsync(async (req, res) => {
    const options = pick(req.query, ["sortBy", "limit", "page"]);
    const result = await ratingService.getRatings(options);
    res.json(result);
});

/**
 Get rating by ID.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with rating data.
 */
const getRatingById = catchAsync(async (req, res) => {
    const result = await ratingService.getRatingById(req.params.id);
    res.json(result);
});

/**
 Get seller ratings.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with seller ratings data.
 */
const getSellerRatings = catchAsync(async (req, res) => {
    const options = pick(req.query, ["sortBy", "limit", "page"]);
    const result = await ratingService.getSellerRatings(options);
    res.json(result);
});

/**
 Get seller ratings by seller ID.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with seller ratings data.
 */
const getSellerRatingsBySellerId = catchAsync(async (req, res) => {
    const options = pick(req.query, ["sortBy", "limit", "page"]);
    const result = await ratingService.getSellerRatingsBySellerId(options, req.params.id);
    res.json(result);
});

/**
 Rate seller.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with rated seller data.
 */
const rateSeller = catchAsync(async (req, res) => {
    const rating = await ratingService.rateSeller(req.body);
    res.status(httpStatus.CREATED).json(rating);
});

/**
 Get buyer ratings.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with buyer ratings data.
 */
const getBuyerRatings = catchAsync(async (req, res) => {
    const options = pick(req.query, ["sortBy", "limit", "page"]);
    const result = await ratingService.getBuyerRatings(options);
    res.json(result);
});

/**
 Get buyer ratings by buyer ID.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with buyer ratings data.
 */
const getBuyerRatingsByBuyerId = catchAsync(async (req, res) => {
    const options = pick(req.query, ["sortBy", "limit", "page"]);
    const result = await ratingService.getBuyerRatingsByBuyerId(options, req.params.id);
    res.json(result);
});

/**
 Rate buyer.
 @param {Object} req - Express request object.
 @param {Object} res - Express response object.
 @returns {Object} JSON response with rated buyer data.
 */
const rateBuyer = catchAsync(async (req, res) => {
    const rating = await ratingService.rateBuyer(req.body);
    res.status(httpStatus.CREATED).json(rating);
});

module.exports = {
    getRatings,
    getRatingById,
    getSellerRatings,
    getSellerRatingsBySellerId,
    rateSeller,
    getBuyerRatings,
    getBuyerRatingsByBuyerId,
    rateBuyer
};