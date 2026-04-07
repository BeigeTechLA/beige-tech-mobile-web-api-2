const httpStatus = require("http-status");
const GlobalFee = require("../models/globalFee.model");
const ApiError = require("../utils/ApiError");
const { initializeGlobalFees, getOnlyRequiredFees } = require("./globalFee.init");

/**
 * Create a global fee
 * @param {Object} feeBody
 * @returns {Promise<GlobalFee>}
 */
const createGlobalFee = async (feeBody) => {
  // Validate fee structure
  if (feeBody.feeStructure === "percentage" && !feeBody.percentageValue) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Percentage value is required for percentage-based fees"
    );
  }

  if (feeBody.feeStructure === "fixed" && !feeBody.fixedAmount) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Fixed amount is required for fixed-amount fees"
    );
  }

  if (
    feeBody.feeStructure === "tiered" &&
    (!feeBody.tiers || feeBody.tiers.length === 0)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Tiers are required for tiered fee structure"
    );
  }

  const globalFee = await GlobalFee.create(feeBody);
  return globalFee;
};

/**
 * Get all global fees with filtering and pagination
 * @param {Object} query
 * @returns {Promise<Object>}
 */
const getAllGlobalFees = async (query) => {
  let filter = {};

  // Filter by fee type
  if (query.feeType) {
    filter.feeType = query.feeType;
  }

  // Filter by active status
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true";
  }

  // Filter by fee structure
  if (query.feeStructure) {
    filter.feeStructure = query.feeStructure;
  }

  // Filter by applicable services
  if (query.applicableTo) {
    filter.applicableTo = { $in: [query.applicableTo] };
  }

  // Search by name
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: "i" } },
      { description: { $regex: query.search, $options: "i" } },
    ];
  }

  // Filter by effective date range
  const now = new Date();
  if (query.effectiveNow === "true") {
    filter.effectiveFrom = { $lte: now };
    filter.$or = [{ effectiveTo: { $gte: now } }, { effectiveTo: null }];
  }

  // Pagination parameters
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 100;
  const skip = (page - 1) * limit;

  // Sort parameters
  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  // Get total count for pagination
  const totalCount = await GlobalFee.countDocuments(filter);

  // Get paginated results
  const fees = await GlobalFee.find(filter)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email")
    .sort(sort)
    .skip(skip)
    .limit(limit);

  return {
    results: fees,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
    totalResults: totalCount,
  };
};

/**
 * Get global fee by ID
 * @param {ObjectId} id
 * @returns {Promise<GlobalFee>}
 */
const getGlobalFeeById = async (id) => {
  const fee = await GlobalFee.findById(id)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

  if (!fee) {
    throw new ApiError(httpStatus.NOT_FOUND, "Global fee not found");
  }

  return fee;
};

/**
 * Update global fee by ID
 * @param {ObjectId} id
 * @param {Object} updateBody
 * @returns {Promise<GlobalFee>}
 */
const updateGlobalFeeById = async (id, updateBody) => {
  const fee = await getGlobalFeeById(id);

  // Validate fee structure if being updated
  if (updateBody.feeStructure) {
    if (
      updateBody.feeStructure === "percentage" &&
      !updateBody.percentageValue &&
      !fee.percentageValue
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Percentage value is required for percentage-based fees"
      );
    }

    if (
      updateBody.feeStructure === "fixed" &&
      !updateBody.fixedAmount &&
      !fee.fixedAmount
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Fixed amount is required for fixed-amount fees"
      );
    }

    if (
      updateBody.feeStructure === "tiered" &&
      !updateBody.tiers &&
      (!fee.tiers || fee.tiers.length === 0)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Tiers are required for tiered fee structure"
      );
    }
  }

  Object.assign(fee, updateBody);
  await fee.save();

  return fee;
};

/**
 * Delete global fee by ID
 * @param {ObjectId} id
 * @returns {Promise<GlobalFee>}
 */
const deleteGlobalFeeById = async (id) => {
  const fee = await getGlobalFeeById(id);
  await fee.deleteOne();
  return fee;
};

/**
 * Get active fees by type
 * @param {String} feeType
 * @returns {Promise<Array>}
 */
const getActiveFeesByType = async (feeType) => {
  const now = new Date();
  return GlobalFee.find({
    feeType,
    isActive: true,
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $gte: now } }, { effectiveTo: null }],
  }).sort({ createdAt: -1 });
};

/**
 * Calculate fee amount for a given booking amount
 * @param {ObjectId} feeId
 * @param {Number} bookingAmount
 * @returns {Promise<Object>}
 */
const calculateFee = async (feeId, bookingAmount) => {
  const fee = await getGlobalFeeById(feeId);

  let feeAmount = 0;
  let calculation = {};

  switch (fee.feeStructure) {
    case "percentage":
      feeAmount = (bookingAmount * fee.percentageValue) / 100;
      calculation = {
        type: "percentage",
        percentage: fee.percentageValue,
        bookingAmount,
        feeAmount,
      };
      break;

    case "fixed":
      feeAmount = fee.fixedAmount;
      calculation = {
        type: "fixed",
        fixedAmount: fee.fixedAmount,
        bookingAmount,
        feeAmount,
      };
      break;

    case "tiered":
      // Find applicable tier
      const tier = fee.tiers.find(
        (t) => bookingAmount >= t.minAmount && bookingAmount <= t.maxAmount
      );

      if (tier) {
        if (tier.percentage) {
          feeAmount = (bookingAmount * tier.percentage) / 100;
          calculation = {
            type: "tiered_percentage",
            tier: {
              min: tier.minAmount,
              max: tier.maxAmount,
              percentage: tier.percentage,
            },
            bookingAmount,
            feeAmount,
          };
        } else if (tier.fixedFee) {
          feeAmount = tier.fixedFee;
          calculation = {
            type: "tiered_fixed",
            tier: {
              min: tier.minAmount,
              max: tier.maxAmount,
              fixedFee: tier.fixedFee,
            },
            bookingAmount,
            feeAmount,
          };
        }
      }
      break;

    default:
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid fee structure");
  }

  return {
    fee: {
      id: fee.id,
      name: fee.name,
      feeType: fee.feeType,
    },
    calculation,
    totalAmount: bookingAmount + feeAmount,
  };
};

/**
 * Get the two required fees (beige_margin and platform_fee)
 * @returns {Promise<Object>}
 */
const getRequiredFees = async () => {
  return getOnlyRequiredFees();
};

module.exports = {
  createGlobalFee,
  getAllGlobalFees,
  getGlobalFeeById,
  updateGlobalFeeById,
  deleteGlobalFeeById,
  getActiveFeesByType,
  calculateFee,
  getRequiredFees,
  initializeGlobalFees,
};
