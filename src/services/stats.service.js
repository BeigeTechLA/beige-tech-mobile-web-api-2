const httpStatus = require("http-status");
const { Order, CP, User } = require("../models");
const ApiError = require("../utils/ApiError");

/**
 * Get summary statistics (total orders, CPs, customers, and gross total)
 * @returns {Promise<Object>} The summary statistics
 */
const getSummaryStats = async () => {
  try {
    // Get total orders count
    const totalOrders = await Order.countDocuments();
    
    // Get total CPs count
    const totalCps = await CP.countDocuments();
    
    // Get total customers count (users with role = 'customer')
    const totalCustomers = await User.countDocuments({ role: 'user' });
    
    // Calculate gross total (CPs + customers)
    const grossCpsCustomers = totalCps + totalCustomers;
    
    return {
      total_orders: totalOrders,
      total_cps: totalCps,
      total_customers: totalCustomers,
      gross_cps_customers: grossCpsCustomers
    };
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR, 
      'Error retrieving summary statistics'
    );
  }
};

module.exports = {
  getSummaryStats,
};
