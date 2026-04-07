const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { faqService, cpService } = require("../services");

/**
 * Create FAQ
 */
const createFAQ = catchAsync(async (req, res) => {
  const faqBody = { ...req.body, createdBy: req.user.id };
  const faq = await faqService.createFAQ(faqBody);
  res.status(httpStatus.CREATED).send(faq);
});

/**
 * Get all FAQs (Admin only)
 */
const getFAQs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['type', 'status', 'isPublic', 'category', 'createdBy', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await faqService.queryFAQs(filter, options);
  res.send(result);
});

/**
 * Get FAQ by ID
 */
const getFAQ = catchAsync(async (req, res) => {
  const faq = await faqService.getFAQById(req.params.faqId);
  res.send(faq);
});

/**
 * Update FAQ
 */
const updateFAQ = catchAsync(async (req, res) => {
  const canModify = await faqService.canModifyFAQ(req.params.faqId, req.user.id, req.user.role);
  if (!canModify) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to modify this FAQ');
  }
  
  const faq = await faqService.updateFAQById(req.params.faqId, req.body);
  res.send(faq);
});

/**
 * Delete FAQ
 */
const deleteFAQ = catchAsync(async (req, res) => {
  const canModify = await faqService.canModifyFAQ(req.params.faqId, req.user.id, req.user.role);
  if (!canModify) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this FAQ');
  }
  
  await faqService.deleteFAQById(req.params.faqId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get public FAQs (No authentication required)
 */
const getPublicFAQs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['type', 'category', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await faqService.getPublicFAQs(filter, options);
  res.send(result);
});

/**
 * Get CP's own FAQs
 */
const getCPFAQs = catchAsync(async (req, res) => {
  if (req.user.role !== 'cp') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only CPs can access this endpoint');
  }

  // Get the CP document to use CP ID instead of User ID
  const cp = await cpService.getCpByUserId(req.user.id);
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, 'CP profile not found');
  }

  const filter = pick(req.query, ['status', 'category', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await faqService.getCPFAQs(cp.id, filter, options);
  res.send(result);
});

/**
 * Create CP FAQ
 */
const createCPFAQ = catchAsync(async (req, res) => {
  if (req.user.role !== 'cp') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only CPs can create CP FAQs');
  }

  // Get the CP document to use CP ID instead of User ID
  const cp = await cpService.getCpByUserId(req.user.id);
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, 'CP profile not found');
  }

  const faqBody = {
    ...req.body,
    createdBy: cp.id, // Use CP ID instead of User ID
    type: 'cp' // Force CP type
  };
  const faq = await faqService.createFAQ(faqBody);
  res.status(httpStatus.CREATED).send(faq);
});

/**
 * Get all CP FAQs for admin management
 */
const getAllCPFAQsForAdmin = catchAsync(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only admins can access this endpoint');
  }
  
  const filter = pick(req.query, ['status', 'category', 'createdBy', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await faqService.getAllCPFAQsForAdmin(filter, options);
  res.send(result);
});

/**
 * Get admin FAQs
 */
const getAdminFAQs = catchAsync(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only admins can access this endpoint');
  }
  
  const filter = pick(req.query, ['status', 'category', 'createdBy', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await faqService.getAdminFAQs(filter, options);
  res.send(result);
});

/**
 * Create admin FAQ
 */
const createAdminFAQ = catchAsync(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only admins can create admin FAQs');
  }
  
  const faqBody = { 
    ...req.body, 
    createdBy: req.user.id,
    type: 'admin' // Force admin type
  };
  const faq = await faqService.createFAQ(faqBody);
  res.status(httpStatus.CREATED).send(faq);
});

/**
 * Get FAQs by CP ID (for public profile view)
 */
const getFAQsByCPId = catchAsync(async (req, res) => {
  const filter = {
    type: 'cp',
    createdBy: req.params.cpId,
    status: 'active',
    isPublic: true
  };
  
  const searchFilter = pick(req.query, ['category', 'search']);
  Object.assign(filter, searchFilter);
  
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await faqService.queryFAQs(filter, options);
  res.send(result);
});

module.exports = {
  createFAQ,
  getFAQs,
  getFAQ,
  updateFAQ,
  deleteFAQ,
  getPublicFAQs,
  getCPFAQs,
  createCPFAQ,
  getAllCPFAQsForAdmin,
  getAdminFAQs,
  createAdminFAQ,
  getFAQsByCPId,
};
