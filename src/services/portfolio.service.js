const httpStatus = require("http-status");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const { Portfolio } = require("../models");

/**
 * Create a new portfolio
 * @param {Object} portfolioBody - Portfolio data
 * @returns {Promise<Portfolio>}
 */
const createPortfolio = async (portfolioBody) => {
  try {
    console.log('Creating portfolio with data:', portfolioBody);
    const portfolio = await Portfolio.create(portfolioBody);

    // Populate CP and User details
    await portfolio.populate('cpId');
    await portfolio.populate('createdBy');

    return portfolio;
  } catch (error) {
    console.error('Error in createPortfolio service:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      throw new ApiError(httpStatus.BAD_REQUEST, `Validation error: ${validationErrors.join(', ')}`);
    }

    // Handle cast errors (invalid ObjectId)
    if (error.name === 'CastError') {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid ${error.path}: ${error.value}`);
    }

    // Handle other specific errors
    if (error instanceof ApiError) {
      throw error;
    }

    // Generic error with more details
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error creating portfolio: ${error.message}`);
  }
};

/**
 * Get portfolio by id
 * @param {ObjectId} id - Portfolio id
 * @returns {Promise<Portfolio>}
 */
const getPortfolioById = async (id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid portfolio ID');
    }

    const portfolio = await Portfolio.findById(id)
      .populate({
        path: 'cpId',
        populate: {
          path: 'userId'
        }
      })
      .populate('createdBy');

    if (!portfolio) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Portfolio not found');
    }

    return portfolio;
  } catch (error) {
    console.error('Error in getPortfolioById:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving portfolio');
  }
};

/**
 * Get all portfolios for a specific CP with pagination
 * @param {ObjectId} cpId - CP id
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getPortfoliosByCpId = async (cpId, options = {}) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(cpId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid CP ID');
    }

    const filter = { cpId, isActive: true };

    const paginateOptions = {
      ...options,
      populate: 'cpId,createdBy',  // paginate plugin expects comma-separated string
      sortBy: options.sortBy || 'createdAt:desc'
    };

    const portfolios = await Portfolio.paginate(filter, paginateOptions);
    return portfolios;
  } catch (error) {
    console.error('Error in getPortfoliosByCpId:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving portfolios');
  }
};

/**
 * Update portfolio by id
 * @param {ObjectId} portfolioId - Portfolio id
 * @param {Object} updateBody - Portfolio update data
 * @returns {Promise<Portfolio>}
 */
const updatePortfolioById = async (portfolioId, updateBody) => {
  try {
    const portfolio = await getPortfolioById(portfolioId);

    // Prevent updating certain fields
    delete updateBody.cpId;
    delete updateBody.createdBy;
    delete updateBody.viewsCount;

    Object.assign(portfolio, updateBody);
    await portfolio.save();

    // Re-populate after update
    await portfolio.populate('cpId');
    await portfolio.populate('createdBy');

    return portfolio;
  } catch (error) {
    console.error('Error in updatePortfolioById:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error updating portfolio');
  }
};

/**
 * Delete portfolio by id (soft delete)
 * @param {ObjectId} portfolioId - Portfolio id
 * @returns {Promise<Portfolio>}
 */
const deletePortfolioById = async (portfolioId) => {
  try {
    const portfolio = await getPortfolioById(portfolioId);

    // Soft delete
    portfolio.isActive = false;
    await portfolio.save();

    return portfolio;
  } catch (error) {
    console.error('Error in deletePortfolioById:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error deleting portfolio');
  }
};

/**
 * Permanently delete portfolio by id
 * @param {ObjectId} portfolioId - Portfolio id
 * @returns {Promise<Portfolio>}
 */
const permanentlyDeletePortfolioById = async (portfolioId) => {
  try {
    const portfolio = await getPortfolioById(portfolioId);
    await Portfolio.deleteOne({ _id: portfolioId });
    return portfolio;
  } catch (error) {
    console.error('Error in permanentlyDeletePortfolioById:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error permanently deleting portfolio');
  }
};

/**
 * Get all portfolios with pagination
 * @param {Object} filter - Filter options
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryPortfolios = async (filter, options) => {
  try {
    // Only show active portfolios by default
    const queryFilter = { ...filter, isActive: true };

    const paginateOptions = {
      ...options,
      populate: 'cpId,createdBy',  // paginate plugin expects comma-separated string
      sortBy: options.sortBy || 'createdAt:desc'
    };

    const portfolios = await Portfolio.paginate(queryFilter, paginateOptions);
    return portfolios;
  } catch (error) {
    console.error('Error in queryPortfolios:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving portfolios');
  }
};

/**
 * Increment portfolio views
 * @param {ObjectId} portfolioId - Portfolio id
 * @returns {Promise<Portfolio>}
 */
const incrementViews = async (portfolioId) => {
  try {
    const portfolio = await Portfolio.findByIdAndUpdate(
      portfolioId,
      { $inc: { viewsCount: 1 } },
      { new: true }
    )
      .populate('cpId')
      .populate('createdBy');

    if (!portfolio) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Portfolio not found');
    }

    return portfolio;
  } catch (error) {
    console.error('Error in incrementViews:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error incrementing views');
  }
};

module.exports = {
  createPortfolio,
  getPortfolioById,
  getPortfoliosByCpId,
  updatePortfolioById,
  deletePortfolioById,
  permanentlyDeletePortfolioById,
  queryPortfolios,
  incrementViews,
};
