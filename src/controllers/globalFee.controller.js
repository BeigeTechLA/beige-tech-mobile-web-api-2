const catchAsync = require("../utils/catchAsync");
const { globalFeeService } = require("../services");
const httpStatus = require("http-status");

/**
 * Create a new global fee
 */
const createGlobalFee = catchAsync(async (req, res) => {
  // Add user ID if authenticated
  if (req.user) {
    req.body.createdBy = req.user.id;
  }

  const globalFee = await globalFeeService.createGlobalFee(req.body);
  res.status(httpStatus.CREATED).json({
    success: true,
    message: "Global fee created successfully",
    data: globalFee,
  });
});

/**
 * Get all global fees
 */
const getAllGlobalFees = catchAsync(async (req, res) => {
  const result = await globalFeeService.getAllGlobalFees(req.query);
  res.status(httpStatus.OK).json({
    success: true,
    ...result,
  });
});

/**
 * Get global fee by ID
 */
const getGlobalFeeById = catchAsync(async (req, res) => {
  const globalFee = await globalFeeService.getGlobalFeeById(
    req.params.feeId
  );
  res.status(httpStatus.OK).json({
    success: true,
    data: globalFee,
  });
});

/**
 * Update global fee by ID
 */
const updateGlobalFeeById = catchAsync(async (req, res) => {
  // Add user ID if authenticated
  if (req.user) {
    req.body.updatedBy = req.user.id;
  }

  const globalFee = await globalFeeService.updateGlobalFeeById(
    req.params.feeId,
    req.body
  );
  res.status(httpStatus.OK).json({
    success: true,
    message: "Global fee updated successfully",
    data: globalFee,
  });
});

/**
 * Delete global fee by ID
 */
const deleteGlobalFeeById = catchAsync(async (req, res) => {
  await globalFeeService.deleteGlobalFeeById(req.params.feeId);
  res.status(httpStatus.OK).json({
    success: true,
    message: "Global fee deleted successfully",
  });
});

/**
 * Get active fees by type (beige_margin, platform_fee)
 */
const getActiveFeesByType = catchAsync(async (req, res) => {
  const fees = await globalFeeService.getActiveFeesByType(req.params.feeType);
  res.status(httpStatus.OK).json({
    success: true,
    count: fees.length,
    data: fees,
  });
});

/**
 * Calculate fee for a booking amount
 */
const calculateFee = catchAsync(async (req, res) => {
  const { feeId } = req.params;
  const { bookingAmount } = req.body;

  if (!bookingAmount || bookingAmount <= 0) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Valid booking amount is required",
    });
  }

  const result = await globalFeeService.calculateFee(feeId, bookingAmount);
  res.status(httpStatus.OK).json({
    success: true,
    data: result,
  });
});

/**
 * Get the two required fees (beige_margin and platform_fee)
 */
const getRequiredFees = catchAsync(async (req, res) => {
  const result = await globalFeeService.getRequiredFees();
  res.status(httpStatus.OK).json(result);
});

/**
 * Initialize default fees (resets to 2 fees with 0% default)
 */
const initializeDefaultFees = catchAsync(async (req, res) => {
  const result = await globalFeeService.initializeGlobalFees();
  res.status(httpStatus.OK).json(result);
});

module.exports = {
  createGlobalFee,
  getAllGlobalFees,
  getGlobalFeeById,
  updateGlobalFeeById,
  deleteGlobalFeeById,
  getActiveFeesByType,
  calculateFee,
  getRequiredFees,
  initializeDefaultFees,
};
