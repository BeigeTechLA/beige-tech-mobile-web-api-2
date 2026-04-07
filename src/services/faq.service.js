const httpStatus = require("http-status");
const { FAQ } = require("../models");
const ApiError = require("../utils/ApiError");

/**
 * Create a FAQ
 * @param {Object} faqBody
 * @returns {Promise<FAQ>}
 */
const createFAQ = async (faqBody) => {
  // Set the appropriate reference model based on the FAQ type
  if (faqBody.type === 'cp') {
    faqBody.createdByModel = 'CP';
  } else {
    faqBody.createdByModel = 'User';
  }
  return FAQ.create(faqBody);
};

/**
 * Query for FAQs
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Ma ximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryFAQs = async (filter, options) => {
  // Handle search functionality
  if (filter.search) {
    filter.$or = [
      { question: { $regex: filter.search, $options: 'i' } },
      { answer: { $regex: filter.search, $options: 'i' } },
      { category: { $regex: filter.search, $options: 'i' } },
    ];
    delete filter.search;
  }

  // Set default sort to latest FAQs first (newest to oldest)
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  options.populate = 'createdBy';

  const faqs = await FAQ.paginate(filter, options);
  return faqs;
};

/**
 * Get FAQ by id
 * @param {ObjectId} id
 * @returns {Promise<FAQ>}
 */
const getFAQById = async (id) => {
  const faq = await FAQ.findById(id).populate('createdBy');
  if (!faq) {
    throw new ApiError(httpStatus.NOT_FOUND, 'FAQ not found');
  }
  return faq;
};

/**
 * Update FAQ by id
 * @param {ObjectId} faqId
 * @param {Object} updateBody
 * @returns {Promise<FAQ>}
 */
const updateFAQById = async (faqId, updateBody) => {
  const faq = await getFAQById(faqId);
  Object.assign(faq, updateBody);
  await faq.save();
  return faq;
};

/**
 * Delete FAQ by id
 * @param {ObjectId} faqId
 * @returns {Promise<FAQ>}
 */
const deleteFAQById = async (faqId) => {
  const faq = await getFAQById(faqId);
  await faq.deleteOne();
  return faq;
};

/**
 * Get public FAQs (only active and public ones)
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getPublicFAQs = async (filter, options) => {
  // Force public and active status
  filter.isPublic = true;
  filter.status = 'active';

  // Handle search functionality
  if (filter.search) {
    filter.$or = [
      { question: { $regex: filter.search, $options: 'i' } },
      { answer: { $regex: filter.search, $options: 'i' } },
      { category: { $regex: filter.search, $options: 'i' } },
    ];
    delete filter.search;
  }

  // Default sorting by order and creation date
  if (!options.sortBy) {
    options.sortBy = 'order:asc,createdAt:desc';
  }

  options.populate = 'createdBy';

  const faqs = await FAQ.paginate(filter, options);
  return faqs;
};

/**
 * Get CP's own FAQs
 * @param {ObjectId} cpId
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getCPFAQs = async (cpId, filter, options) => {
  // Force CP type and createdBy
  filter.type = 'cp';
  filter.createdBy = cpId;

  // Handle search functionality
  if (filter.search) {
    filter.$or = [
      { question: { $regex: filter.search, $options: 'i' } },
      { answer: { $regex: filter.search, $options: 'i' } },
      { category: { $regex: filter.search, $options: 'i' } },
    ];
    delete filter.search;
  }

  // Set default sort to latest FAQs first (newest to oldest)
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  options.populate = 'createdBy';

  const faqs = await FAQ.paginate(filter, options);
  return faqs;
};

/**
 * Get all CP FAQs for admin view
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getAllCPFAQsForAdmin = async (filter, options) => {
  // Force CP type
  filter.type = 'cp';

  // Handle search functionality
  if (filter.search) {
    filter.$or = [
      { question: { $regex: filter.search, $options: 'i' } },
      { answer: { $regex: filter.search, $options: 'i' } },
      { category: { $regex: filter.search, $options: 'i' } },
    ];
    delete filter.search;
  }

  // Set default sort to latest FAQs first (newest to oldest)
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  options.populate = 'createdBy';

  const faqs = await FAQ.paginate(filter, options);
  return faqs;
};

/**
 * Get admin FAQs
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getAdminFAQs = async (filter, options) => {
  // Force admin type
  filter.type = 'admin';

  // Handle search functionality
  if (filter.search) {
    filter.$or = [
      { question: { $regex: filter.search, $options: 'i' } },
      { answer: { $regex: filter.search, $options: 'i' } },
      { category: { $regex: filter.search, $options: 'i' } },
    ];
    delete filter.search;
  }

  // Set default sort to latest FAQs first (newest to oldest)
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  options.populate = 'createdBy';

  const faqs = await FAQ.paginate(filter, options);
  return faqs;
};

/**
 * Check if user can modify FAQ
 * @param {ObjectId} faqId
 * @param {ObjectId} userId
 * @param {string} userRole
 * @returns {Promise<boolean>}
 */
const canModifyFAQ = async (faqId, userId, userRole) => {
  const faq = await getFAQById(faqId);

  // Admin can modify any FAQ
  if (userRole === 'admin') {
    return true;
  }

  // CP can only modify their own CP FAQs
  if (userRole === 'cp' && faq.type === 'cp') {
    // For CP FAQs, we need to check if the CP ID matches
    // First get the CP document for this user
    const { cpService } = require('../services');
    const cp = await cpService.getCpByUserId(userId);

    if (!cp) {
      return false;
    }

    // Handle both populated and non-populated createdBy field
    const createdById = faq.createdBy._id ? faq.createdBy._id.toString() : faq.createdBy.toString();
    if (createdById === cp.id.toString()) {
      return true;
    }
  }

  return false;
};

module.exports = {
  createFAQ,
  queryFAQs,
  getFAQById,
  updateFAQById,
  deleteFAQById,
  getPublicFAQs,
  getCPFAQs,
  getAllCPFAQsForAdmin,
  getAdminFAQs,
  canModifyFAQ,
};
