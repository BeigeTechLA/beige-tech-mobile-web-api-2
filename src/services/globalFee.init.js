const GlobalFee = require("../models/globalFee.model");

/**
 * Initialize global fees with ONLY 2 required fees
 * This will:
 * 1. Delete all existing fees
 * 2. Create exactly 2 fees: beige_margin and platform_fee
 * 3. Set both to 0% by default
 */
const initializeGlobalFees = async () => {
  try {
    console.log("🔄 Initializing Global Fees...");

    // Step 1: Delete all existing fees
    const deleteResult = await GlobalFee.deleteMany({});
    console.log(`✓ Deleted ${deleteResult.deletedCount} existing fees`);

    // Step 2: Create the 2 required fees with $0 default (fixed amount)
    const defaultFees = [
      {
        feeType: "beige_margin",
        name: "Beige Margin",
        description: "Beige platform margin applied to all bookings",
        feeStructure: "fixed",
        fixedAmount: 0,
        currency: "USD",
        applicableTo: ["all"],
        isActive: true,
      },
      {
        feeType: "platform_fee",
        name: "Platform Fee",
        description: "Platform fee applied to all bookings",
        feeStructure: "fixed",
        fixedAmount: 0,
        currency: "USD",
        applicableTo: ["all"],
        isActive: true,
      },
    ];

    const createdFees = await GlobalFee.insertMany(defaultFees);
    console.log(`✓ Created ${createdFees.length} default fees ($0 each)`);

    return {
      success: true,
      message: "Global fees initialized successfully",
      data: createdFees.map((fee) => ({
        feeType: fee.feeType,
        name: fee.name,
        feeStructure: fee.feeStructure,
        fixedAmount: fee.fixedAmount,
        currency: fee.currency,
        id: fee.id,
      })),
    };
  } catch (error) {
    console.error("❌ Error initializing global fees:", error);
    return {
      success: false,
      message: "Failed to initialize global fees",
      error: error.message,
    };
  }
};

/**
 * Get only the 2 required fees
 */
const getOnlyRequiredFees = async () => {
  try {
    // Get only beige_margin and platform_fee
    const fees = await GlobalFee.find({
      feeType: { $in: ["beige_margin", "platform_fee"] },
    })
      .select(
        "feeType name description feeStructure fixedAmount currency isActive createdAt updatedAt"
      )
      .sort({ feeType: 1 })
      .limit(2);

    // If we don't have exactly 2, initialize them
    if (fees.length !== 2) {
      await initializeGlobalFees();
      return getOnlyRequiredFees(); // Recursive call to get the newly created fees
    }

    return {
      success: true,
      count: fees.length,
      data: fees,
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to get required fees",
      error: error.message,
    };
  }
};

module.exports = {
  initializeGlobalFees,
  getOnlyRequiredFees,
};
