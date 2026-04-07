const dashboardService = require("../services/dashboard.service");
const { roles } = require("../config/roles");

/**
 * Get dashboard statistics based on user role
 * @route GET /api/v1/dashboard
 * @access Private
 */
const getDashboard = async (req, res) => {
  try {
    const { user } = req;
    let dashboardData;

    switch (user.role) {
      case roles.ADMIN:
        dashboardData = await dashboardService.getAdminDashboard();
        break;
      case roles.CLIENT:
        dashboardData = await dashboardService.getClientDashboard(user._id);
        break;
      case roles.CONTENT_PROVIDER:
        dashboardData = await dashboardService.getContentProviderDashboard(
          user._id
        );
        break;
      default:
        return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error in getDashboard:", error);
    res.status(500).json({
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
};

/**
 * Get admin dashboard statistics
 * @route GET /api/v1/dashboard/admin
 * @access Private/Admin
 */
const getAdminDashboard = async (req, res) => {
  try {
    // if (req.user.role !== roles.ADMIN) {
    //   return res.status(403).json({ message: "Access denied. Admin only." });
    // }
    
    // Extract date range parameters if provided
    const { fromDate, toDate } = req.query;
    const options = {};
    
    // Validate and add date parameters to options
    if (fromDate) {
      const parsedFromDate = new Date(fromDate);
      if (!isNaN(parsedFromDate.getTime())) {
        options.fromDate = parsedFromDate;
      } else {
        return res.status(400).json({ 
          message: "Invalid fromDate format. Please use YYYY-MM-DD format." 
        });
      }
    }
    
    if (toDate) {
      const parsedToDate = new Date(toDate);
      if (!isNaN(parsedToDate.getTime())) {
        options.toDate = parsedToDate;
        // Set the time to the end of the day for inclusive filtering
        options.toDate.setHours(23, 59, 59, 999);
      } else {
        return res.status(400).json({ 
          message: "Invalid toDate format. Please use YYYY-MM-DD format." 
        });
      }
    }

    const dashboardData = await dashboardService.getAdminDashboard(options);
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error in getAdminDashboard:", error);
    res.status(500).json({
      message: "Error fetching admin dashboard",
      error: error.message,
    });
  }
};

/**
 * Get client dashboard statistics
 * @route GET /api/v1/dashboard/client
 * @access Private/Client, Admin
 */
const getClientDashboard = async (req, res) => {
  try {
    const clientId = req.params.clientId;

    if (!clientId) {
      return res.status(400).json({ message: "Client ID is required" });
    }

    const dashboardData = await dashboardService.getClientDashboard(clientId);
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error in getClientDashboard:", error);
    res.status(500).json({
      message: "Error fetching client dashboard",
      error: error.message,
    });
  }
};

/**
 * Get content provider dashboard statistics
 * @route GET /api/v1/dashboard/cp
 * @access Private/ContentProvider, Admin
 */
const getContentProviderDashboard = async (req, res) => {
  try {
    const cpId = req.user.role === roles.ADMIN ? req.query.cpId : req.user._id;

    if (!cpId) {
      return res
        .status(400)
        .json({ message: "Content Provider ID is required" });
    }

    const dashboardData = await dashboardService.getContentProviderDashboard(
      cpId
    );
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error in getContentProviderDashboard:", error);
    res.status(500).json({
      message: "Error fetching content provider dashboard",
      error: error.message,
    });
  }
};

/**
 * Get content provider detailed information
 * @route GET /api/v1/dashboard/cp/:cpId/details
 * @access Private/Admin
 */
const getContentProviderDetails = async (req, res) => {
  try {
    const { cpId } = req.params;

    if (!cpId) {
      return res
        .status(400)
        .json({ message: "Content Provider ID is required" });
    }

    const cpDetails = await dashboardService.getContentProviderDetails(cpId);
    res.status(200).json(cpDetails);
  } catch (error) {
    console.error("Error in getContentProviderDetails:", error);
    res.status(500).json({
      message: "Error fetching content provider details",
      error: error.message,
    });
  }
};

/**
 * Get client detailed information
 * @route GET /api/v1/dashboard/client/:clientId/details
 * @access Private/Admin
 */
const getClientDetails = async (req, res) => {
  try {
    const { clientId } = req.params;

    if (!clientId) {
      return res
        .status(400)
        .json({ message: "Client ID is required" });
    }

    const clientDetails = await dashboardService.getClientDetails(clientId);
    res.status(200).json(clientDetails);
  } catch (error) {
    console.error("Error in getClientDetails:", error);
    res.status(500).json({
      message: "Error fetching client details",
      error: error.message,
    });
  }
};

/**
 * Get service providers (CPs) booked by a specific client
 * @route GET /api/v1/dashboard/client/:clientId/service-providers
 * @access Private/Admin, Private/Client
 */
const getClientBookedServiceProviders = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { user } = req;
    
    // Check if the user is authorized to access this data
    // Allow if user is an admin or if the user is requesting their own data
    // if (user.role !== roles.ADMIN && user._id.toString() !== clientId) {
    //   return res.status(403).json({ message: "Access denied" });
    // }
    
    let serviceProviders = await dashboardService.getClientBookedServiceProviders(clientId);
    
    res.status(200).json({
      success: true,
      count: serviceProviders.length,
      data: serviceProviders
    });
  } catch (error) {
    console.error("Error fetching client's booked service providers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch service providers",
      error: error.message
    });
  }
};

/**
 * Get shoot overview and upcoming meetings for a content provider
 * @access Private/ContentProvider, Admin
 */
const getShootOverviewAndMeetings = async (req, res) => {
  try {
    const { cpId } = req.params;
    const { user } = req;
    
    const overviewData = await dashboardService.getShootOverviewAndMeetings(cpId);
    
    res.status(200).json({
      success: true,
      data: overviewData
    });
  } catch (error) {
    console.error("Error fetching shoot overview and meetings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shoot overview and meetings",
      error: error.message
    });
  }
};

/**
 * Get financial summary and shoot statistics for a content provider
 * @route GET /api/v1/dashboard/cp/:cpId/financial-summary
 * @access Private/ContentProvider, Admin
 */
const getFinancialAndShootSummary = async (req, res) => {
  try {
    const { cpId } = req.params;
    const { user } = req;
    
    // Check if the user is authorized to access this data
    // Allow if user is an admin or if the user is requesting their own data
    // if (user.role !== roles.ADMIN && user._id.toString() !== cpId) {
    //   return res.status(403).json({ message: "Access denied" });
    // }
    
    const summaryData = await dashboardService.getFinancialAndShootSummary(cpId);
    
    res.status(200).json({
      success: true,
      data: summaryData
    });
  } catch (error) {
    console.error("Error fetching financial and shoot summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch financial and shoot summary",
      error: error.message
    });
  }
};

/**
 * Debug endpoint to check what orders the dashboard sees for a client
 * @route GET /api/v1/dashboard/debug-client-orders
 * @access Public (temporary for troubleshooting)
 */
const debugClientOrders = async (req, res) => {
  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({ message: "Client ID is required" });
    }

    // Get what the dashboard service sees
    const dashboardData = await dashboardService.getClientDashboard(clientId);

    // Get raw orders for this client
    const Order = require("../models/order.model");
    const rawOrders = await Order.find({ client_id: clientId }).lean();

    // Get bookings that should have been converted
    const Booking = require("../models/booking.model");
    const userBookings = await Booking.find({ userId: clientId }).lean();

    res.status(200).json({
      success: true,
      data: {
        clientId,
        dashboardSees: {
          totalOrders: dashboardData.overview.total_orders,
          completedOrders: dashboardData.overview.completed_orders,
          totalSpent: dashboardData.overview.total_spent
        },
        rawOrdersCount: rawOrders.length,
        rawOrders: rawOrders.map(o => ({
          id: o._id,
          client_id: o.client_id,
          booking_ref: o.booking_ref,
          booking_source: o.booking_source,
          order_status: o.order_status,
          shoot_cost: o.shoot_cost,
          createdAt: o.createdAt
        })),
        userBookings: {
          total: userBookings.length,
          details: userBookings.map(b => ({
            id: b._id,
            userId: b.userId,
            status: b.status,
            paymentStatus: b.paymentStatus,
            orderId: b.orderId,
            convertedAt: b.convertedAt,
            totalAmount: b.totalAmount,
            createdAt: b.createdAt
          }))
        }
      }
    });
  } catch (error) {
    console.error("Error in debugClientOrders:", error);
    res.status(500).json({
      message: "Error fetching debug data",
      error: error.message,
    });
  }
};

/**
 * Get post-production manager dashboard statistics with time-based data
 * @route GET /api/v1/dashboard/post-production
 * @access Private/PostProductionManager, Admin
 */
const getPostProductionDashboard = async (req, res) => {
  try {
    // Extract time period parameter (24h, 7d, 15d, 1m)
    const { timePeriod = '24h' } = req.query;
    
    // Validate time period
    const validTimePeriods = ['24h', '7d', '15d', '1m'];
    if (!validTimePeriods.includes(timePeriod)) {
      return res.status(400).json({ 
        message: "Invalid time period. Use '24h', '7d', '15d', or '1m'."
      });
    }
    
    const dashboardData = await dashboardService.getPostProductionDashboard(timePeriod);
    
    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error("Error in getPostProductionDashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch post-production dashboard data",
      error: error.message
    });
  }
};

module.exports = {
  getDashboard,
  getAdminDashboard,
  getClientDashboard,
  getContentProviderDashboard,
  getContentProviderDetails,
  getClientDetails,
  getClientBookedServiceProviders,
  getShootOverviewAndMeetings,
  getFinancialAndShootSummary,
  getPostProductionDashboard,
  debugClientOrders
};
