const GlobalFee = require("../models/globalFee.model");

/**
 * Default global fees configuration
 */
const DEFAULT_FEES = [
  {
    feeType: "beige_margin",
    name: "Beige Margin",
    description: "Beige platform margin applied to all bookings",
    feeStructure: "percentage",
    percentageValue: 0,
    currency: "USD",
    applicableTo: ["all"],
    isActive: true,
  },
  {
    feeType: "platform_fee",
    name: "Platform Fee",
    description: "Platform fee applied to all bookings",
    feeStructure: "percentage",
    percentageValue: 0,
    currency: "USD",
    applicableTo: ["all"],
    isActive: true,
  },
];

/**
 * Initialize default global fees
 * Creates the two required fees (beige_margin and platform_fee) if they don't exist
 * @returns {Promise<Object>}
 */
const initializeDefaultFees = async () => {
  try {
    const results = {
      created: [],
      existing: [],
      errors: [],
    };

    for (const defaultFee of DEFAULT_FEES) {
      // Check if fee already exists
      const existingFee = await GlobalFee.findOne({
        feeType: defaultFee.feeType,
      });

      if (existingFee) {
        results.existing.push({
          feeType: defaultFee.feeType,
          id: existingFee.id,
          message: `${defaultFee.feeType} already exists`,
        });
      } else {
        // Create new fee
        const newFee = await GlobalFee.create(defaultFee);
        results.created.push({
          feeType: newFee.feeType,
          id: newFee.id,
          message: `${newFee.feeType} created successfully`,
        });
      }
    }

    return {
      success: true,
      message: "Default fees initialization completed",
      results,
    };
  } catch (error) {
    console.error("Error initializing default fees:", error);
    return {
      success: false,
      message: "Failed to initialize default fees",
      error: error.message,
    };
  }
};

/**
 * Get both required fees (beige_margin and platform_fee)
 * Creates them if they don't exist
 * @returns {Promise<Object>}
 */
const getRequiredFees = async () => {
  // First ensure they exist
  await initializeDefaultFees();

  // Get both fees
  const beigeMargin = await GlobalFee.findOne({ feeType: "beige_margin" });
  const platformFee = await GlobalFee.findOne({ feeType: "platform_fee" });

  return {
    beigeMargin,
    platformFee,
  };
};

/**
 * Reset fees to default values (0%)
 * @returns {Promise<Object>}
 */
const resetFeesToDefault = async () => {
  try {
    const results = [];

    for (const defaultFee of DEFAULT_FEES) {
      const updated = await GlobalFee.findOneAndUpdate(
        { feeType: defaultFee.feeType },
        {
          percentageValue: 0,
          description: defaultFee.description,
          isActive: true,
        },
        { new: true, upsert: true }
      );

      results.push({
        feeType: updated.feeType,
        id: updated.id,
        percentageValue: updated.percentageValue,
      });
    }

    return {
      success: true,
      message: "Fees reset to default (0%)",
      data: results,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to reset fees",
      error: error.message,
    };
  }
};

module.exports = {
  initializeDefaultFees,
  getRequiredFees,
  resetFeesToDefault,
  DEFAULT_FEES,
};
