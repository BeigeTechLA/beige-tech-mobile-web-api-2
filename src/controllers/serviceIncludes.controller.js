const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { serviceIncludesService } = require("../services");

/**
 * Create service includes from array
 * @route POST /service-includes
 * @param {Object} req - Request object with cpId and title array in body
 * @param {Object} res - Response object
 */
const createServiceIncludes = catchAsync(async (req, res) => {
  const serviceIncludes = await serviceIncludesService.createServiceIncludes(req.body);
  res.status(httpStatus.CREATED).send({
    message: "Service includes created successfully",
    data: serviceIncludes,
    count: serviceIncludes.length,
  });
});

/**
 * Get all service includes with filters
 * @route GET /service-includes
 * @param {Object} req - Request object with query parameters
 * @param {Object} res - Response object
 */
const getServiceIncludes = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["cpId", "status"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await serviceIncludesService.queryServiceIncludes(filter, options);
  res.send(result);
});

/**
 * Get service includes by CP ID
 * @route GET /service-includes/cp/:cpId
 * @param {Object} req - Request object with cpId in params
 * @param {Object} res - Response object
 */
const getServiceIncludesByCpId = catchAsync(async (req, res) => {
  const { cpId } = req.params;
  const options = pick(req.query, ["status", "sortBy", "limit", "page"]);
  const result = await serviceIncludesService.getServiceIncludesByCpId(cpId, options);
  res.send(result);
});

/**
 * Get single service include by ID
 * @route GET /service-includes/:serviceId
 * @param {Object} req - Request object with serviceId in params
 * @param {Object} res - Response object
 */
const getServiceInclude = catchAsync(async (req, res) => {
  const serviceInclude = await serviceIncludesService.getServiceIncludeById(req.params.serviceId);
  res.send(serviceInclude);
});

/**
 * Update service include by ID
 * @route PATCH /service-includes/:serviceId
 * @param {Object} req - Request object with serviceId in params and update data in body
 * @param {Object} res - Response object
 */
const updateServiceInclude = catchAsync(async (req, res) => {
  const serviceInclude = await serviceIncludesService.updateServiceIncludeById(
    req.params.serviceId,
    req.body
  );
  res.send({
    message: "Service include updated successfully",
    data: serviceInclude,
  });
});

/**
 * Delete service include by ID
 * @route DELETE /service-includes/:serviceId
 * @param {Object} req - Request object with serviceId in params
 * @param {Object} res - Response object
 */
const deleteServiceInclude = catchAsync(async (req, res) => {
  await serviceIncludesService.deleteServiceIncludeById(req.params.serviceId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createServiceIncludes,
  getServiceIncludes,
  getServiceIncludesByCpId,
  getServiceInclude,
  updateServiceInclude,
  deleteServiceInclude,
};
