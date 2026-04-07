const httpStatus = require("http-status");
const { ShootType } = require("../models");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");

/**
 * Create a shoot type
 * @param {Object} shootTypeBody
 * @returns {Promise<ShootType>}
 */
const createShootType = async (shootTypeBody) => {
  try {
    // Check if title already exists
    const existingShootType = await ShootType.findOne({ 
      title: { $regex: new RegExp(`^${shootTypeBody.title}$`, 'i') }
    });
    
    if (existingShootType) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Shoot type with this title already exists');
    }

    const shootType = await ShootType.create(shootTypeBody);
    return shootType;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      throw new ApiError(httpStatus.BAD_REQUEST, `Validation error: ${validationErrors.join(', ')}`);
    }
    
    if (error.code === 11000) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Shoot type with this title already exists');
    }
    
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error creating shoot type: ${error.message}`);
  }
};

/**
 * Query for shoot types
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortBy=field:desc
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryShootTypes = async (filter, options) => {
  // Handle search functionality
  if (filter.search) {
    filter.$or = [
      { title: { $regex: filter.search, $options: 'i' } },
      { description: { $regex: filter.search, $options: 'i' } }
    ];
    delete filter.search;
  }

  const shootTypes = await ShootType.paginate(filter, {
    ...options,
    populate: 'createdBy,updatedBy',
  });
  
  return shootTypes;
};

/**
 * Get shoot type by id
 * @param {ObjectId} id
 * @returns {Promise<ShootType>}
 */
const getShootTypeById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid shoot type ID');
  }
  
  const shootType = await ShootType.findById(id).populate('createdBy updatedBy', 'name email');
  if (!shootType) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shoot type not found');
  }
  return shootType;
};

/**
 * Get shoot type by slug
 * @param {string} slug
 * @returns {Promise<ShootType>}
 */
const getShootTypeBySlug = async (slug) => {
  const shootType = await ShootType.findOne({ slug }).populate('createdBy updatedBy', 'name email');
  if (!shootType) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shoot type not found');
  }
  return shootType;
};

/**
 * Update shoot type by id
 * @param {ObjectId} shootTypeId
 * @param {Object} updateBody
 * @returns {Promise<ShootType>}
 */
const updateShootTypeById = async (shootTypeId, updateBody) => {
  const shootType = await getShootTypeById(shootTypeId);
  
  // Check if title is being updated and if it conflicts with existing titles
  if (updateBody.title && updateBody.title !== shootType.title) {
    const existingShootType = await ShootType.findOne({ 
      title: { $regex: new RegExp(`^${updateBody.title}$`, 'i') },
      _id: { $ne: shootTypeId }
    });
    
    if (existingShootType) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Shoot type with this title already exists');
    }
  }
  
  Object.assign(shootType, updateBody);
  await shootType.save();
  return shootType;
};

/**
 * Delete shoot type by id
 * @param {ObjectId} shootTypeId
 * @returns {Promise<ShootType>}
 */
const deleteShootTypeById = async (shootTypeId) => {
  const shootType = await getShootTypeById(shootTypeId);
  await shootType.deleteOne();
  return shootType;
};

/**
 * Get public shoot types (active only)
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getPublicShootTypes = async (filter = {}, options = {}) => {
  // Force active status for public API
  filter.status = 'active';

  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 50;
  const skip = (page - 1) * limit;

  // Parse sort options
  let sort = { sortOrder: 1, title: 1 };
  if (options.sortBy) {
    const sortParts = options.sortBy.split(':');
    const sortField = sortParts[0];
    const sortOrder = sortParts[1] === 'desc' ? -1 : 1;
    sort = { [sortField]: sortOrder };
  }

  // Get total count
  const totalResults = await ShootType.countDocuments(filter);

  // Get results with only required fields
  const results = await ShootType.find(filter)
    .select('title slug _id')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  const totalPages = Math.ceil(totalResults / limit);

  return {
    results,
    page,
    limit,
    totalPages,
    totalResults,
  };
};

/**
 * Get public shoot type by slug (active only)
 * @param {string} slug
 * @returns {Promise<Object>}
 */
const getPublicShootTypeBySlug = async (slug) => {
  const shootType = await ShootType.findOne({
    slug,
    status: 'active'
  }).select('title slug _id');
  
  if (!shootType) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shoot type not found');
  }
  
  return shootType;
};

module.exports = {
  createShootType,
  queryShootTypes,
  getShootTypeById,
  getShootTypeBySlug,
  updateShootTypeById,
  deleteShootTypeById,
  getPublicShootTypes,
  getPublicShootTypeBySlug,
};
