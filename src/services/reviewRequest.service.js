const httpStatus = require('http-status');
const { ReviewRequest } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a review request
 * @param {Object} requestBody
 * @returns {Promise<ReviewRequest>}
 */
const createReviewRequest = async (requestBody) => {
  try {
    // Check if a request from this CP for this order already exists
    const existingRequest = await ReviewRequest.findOne({
      cpId: requestBody.cpId,
      orderId: requestBody.orderId,
    });

    if (existingRequest) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'A review request for this order has already been sent');
    }

    return ReviewRequest.create(requestBody);
  } catch (error) {
    if (error.code === 11000) { // MongoDB duplicate key error
      throw new ApiError(httpStatus.BAD_REQUEST, 'A review request for this order has already been sent');
    }
    throw error;
  }
};

/**
 * Get review requests for a user
 * @param {ObjectId} userId
 * @returns {Promise<QueryResult>}
 */
const getReviewRequestsByUser = async (userId, options) => {
  const requests = await ReviewRequest.paginate(
    { userId }, 
    { 
      ...options,
      populate: 'cpId,userId'
    }
  );
  return requests;
};

/**
 * Get review requests sent by a CP
 * @param {ObjectId} cpId
 * @returns {Promise<QueryResult>}
 */
const getReviewRequestsByCp = async (cpId, options) => {
  const requests = await ReviewRequest.paginate(
    { cpId }, 
    { 
      ...options,
      populate: 'cpId,userId'
    }
  );
  return requests;
};

/**
 * Get all review requests (for admin)
 * @returns {Promise<QueryResult>}
 */
const getAllReviewRequests = async (options) => {
  const requests = await ReviewRequest.paginate(
    {}, 
    { 
      ...options,
      populate: 'cpId,userId'
    }
  );
  return requests;
};

/**
 * Get review request by id
 * @param {ObjectId} id
 * @returns {Promise<ReviewRequest>}
 */
const getReviewRequestById = async (id) => {
  const reviewRequest = await ReviewRequest.findById(id);
  if (!reviewRequest) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Review request not found');
  }
  return reviewRequest;
};

/**
 * Update review request status
 * @param {ObjectId} reviewRequestId
 * @param {Object} updateBody
 * @returns {Promise<ReviewRequest>}
 */
const updateReviewRequestStatus = async (reviewRequestId, updateBody) => {
  const reviewRequest = await getReviewRequestById(reviewRequestId);
  
  if (!['accepted', 'rejected'].includes(updateBody.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status value');
  }
  
  Object.assign(reviewRequest, { status: updateBody.status });
  await reviewRequest.save();
  return reviewRequest;
};

module.exports = {
  createReviewRequest,
  getReviewRequestsByUser,
  getReviewRequestsByCp,
  getReviewRequestById,
  updateReviewRequestStatus,
  getAllReviewRequests,
};
