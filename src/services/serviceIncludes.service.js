const httpStatus = require("http-status");
const { ServiceIncludes, CP } = require("../models");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");

/**
 * Create multiple service includes from array
 * @param {Object} serviceIncludesBody - Contains cpId and title array
 * @returns {Promise<Array>} - Array of created service includes
 */
const createServiceIncludes = async (serviceIncludesBody) => {
  const { cpId, title } = serviceIncludesBody;

  // Verify CP exists
  const cp = await CP.findOne({ userId: cpId });
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }

  // Create array of service include documents
  const serviceIncludesData = title.map((serviceTitle) => ({
    cpId: cp._id, // Use the actual CP document ID
    title: serviceTitle.trim(),
  }));

  // Insert all service includes
  const createdServices = await ServiceIncludes.insertMany(serviceIncludesData);
  return createdServices;
};

/**
 * Query service includes with filters and pagination
 * @param {Object} filter - MongoDB filter object
 * @param {Object} options - Query options (pagination, sorting)
 * @returns {Promise<Object>} - Paginated results
 */
const queryServiceIncludes = async (filter, options) => {
  const serviceIncludes = await ServiceIncludes.paginate(filter, options);
  return serviceIncludes;
};

/**
 * Get service includes by CP ID
 * @param {String} cpId - CP user ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of service includes
 */
const getServiceIncludesByCpId = async (cpId, options = {}) => {
  // Find CP by userId
  const cp = await CP.findOne({ userId: cpId });
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }

  const filter = { 
    cpId: cp._id, 
    status: options.status || "active" 
  };

  const queryOptions = {
    sortBy: options.sortBy || "created_at:desc",
    limit: options.limit || 100,
    page: options.page || 1,
  };

  return ServiceIncludes.paginate(filter, queryOptions);
};

/**
 * Get service include by ID
 * @param {String} serviceId - Service include ID
 * @returns {Promise<Object>} - Service include document
 */
const getServiceIncludeById = async (serviceId) => {
  const serviceInclude = await ServiceIncludes.findById(serviceId).populate({
    path: "cpId",
    populate: {
      path: "userId",
      select: "name email",
    },
  });

  if (!serviceInclude) {
    throw new ApiError(httpStatus.NOT_FOUND, "Service include not found");
  }

  return serviceInclude;
};

/**
 * Update service include by ID
 * @param {String} serviceId - Service include ID
 * @param {Object} updateBody - Update data
 * @returns {Promise<Object>} - Updated service include
 */
const updateServiceIncludeById = async (serviceId, updateBody) => {
  const serviceInclude = await getServiceIncludeById(serviceId);
  Object.assign(serviceInclude, updateBody);
  await serviceInclude.save();
  return serviceInclude;
};

/**
 * Delete service include by ID
 * @param {String} serviceId - Service include ID
 * @returns {Promise<Object>} - Deleted service include
 */
const deleteServiceIncludeById = async (serviceId) => {
  const serviceInclude = await getServiceIncludeById(serviceId);
  await serviceInclude.deleteOne();
  return serviceInclude;
};

module.exports = {
  createServiceIncludes,
  queryServiceIncludes,
  getServiceIncludesByCpId,
  getServiceIncludeById,
  updateServiceIncludeById,
  deleteServiceIncludeById,
};
