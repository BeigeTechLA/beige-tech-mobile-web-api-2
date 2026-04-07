const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { shootTypeService } = require("../services");

/**
 * Create a shoot type
 * @route POST /shoot-types
 */
const createShootType = catchAsync(async (req, res) => {
  const shootType = await shootTypeService.createShootType(req.body);
  res.status(httpStatus.CREATED).send({
    message: "Shoot type created successfully",
    data: shootType,
  });
});

/**
 * Get all shoot types with pagination and filters
 * @route GET /shoot-types
 */
const getShootTypes = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["title", "status", "search"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  
  // Set default values
  options.limit = options.limit || 10;
  options.page = options.page || 1;
  options.sortBy = options.sortBy || "sortOrder:asc";
  
  const result = await shootTypeService.queryShootTypes(filter, options);
  res.send(result);
});

/**
 * Get shoot type by ID
 * @route GET /shoot-types/:shootTypeId
 */
const getShootType = catchAsync(async (req, res) => {
  const shootType = await shootTypeService.getShootTypeById(req.params.shootTypeId);
  res.send(shootType);
});

/**
 * Get shoot type by slug
 * @route GET /shoot-types/slug/:slug
 */
const getShootTypeBySlug = catchAsync(async (req, res) => {
  const shootType = await shootTypeService.getShootTypeBySlug(req.params.slug);
  res.send(shootType);
});

/**
 * Update shoot type by ID
 * @route PATCH /shoot-types/:shootTypeId
 */
const updateShootType = catchAsync(async (req, res) => {
  const shootType = await shootTypeService.updateShootTypeById(
    req.params.shootTypeId,
    req.body
  );
  res.send({
    message: "Shoot type updated successfully",
    data: shootType,
  });
});

/**
 * Delete shoot type by ID
 * @route DELETE /shoot-types/:shootTypeId
 */
const deleteShootType = catchAsync(async (req, res) => {
  await shootTypeService.deleteShootTypeById(req.params.shootTypeId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get public shoot types (active only)
 * @route GET /public/shoot-types
 */
const getPublicShootTypes = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["status"]);
  const options = pick(req.query, ["limit", "page", "sortBy"]);
  
  // Set default values for public API
  options.limit = options.limit || 50;
  options.page = options.page || 1;
  options.sortBy = options.sortBy || "sortOrder:asc";
  
  const result = await shootTypeService.getPublicShootTypes(filter, options);
  res.send(result);
});

/**
 * Get public shoot type by slug (active only)
 * @route GET /public/shoot-types/:slug
 */
const getPublicShootTypeBySlug = catchAsync(async (req, res) => {
  const shootType = await shootTypeService.getPublicShootTypeBySlug(req.params.slug);
  res.send(shootType);
});

module.exports = {
  createShootType,
  getShootTypes,
  getShootType,
  getShootTypeBySlug,
  updateShootType,
  deleteShootType,
  getPublicShootTypes,
  getPublicShootTypeBySlug,
};
