const express = require("express");
const router = express.Router();
const dashboard = require("../../controllers/dashboard.controller");
const auth = require("../../middlewares/auth");
const { roles } = require("../../config/roles");

/**
 * @route GET /api/v1/dashboard
 * @description Get dashboard statistics based on user role
 * @access Private
 */
router.get("/", dashboard.getDashboard);

/**
 * @route GET /api/v1/dashboard/admin
 * @description Get admin dashboard statistics
 * @access Private/Admin
 */
router.get("/admin", dashboard.getAdminDashboard);
// router.get("/admin", auth(roles.ADMIN), dashboard.getAdminDashboard);

/**
 * @route GET /api/v1/dashboard/client
 * @description Get client dashboard statistics
 * @access Private/Client, Admin
 */
// router.get("/client", auth([roles.CLIENT, roles.ADMIN]), dashboard.getClientDashboard);
router.get("/client/:clientId", dashboard.getClientDashboard);

/**
 * @route GET /api/v1/dashboard/client/:clientId/details
 * @description Get detailed information about a client
 * @access Private/Admin
 */
router.get("/client/:clientId/details", dashboard.getClientDetails);

/**
 * @description Get service providers (CPs) booked by a specific client
 * @access Private/Admin, Private/Client
 */
router.get("/client/:clientId/service-providers", 
  // auth([roles.ADMIN, roles.CLIENT]),
  dashboard.getClientBookedServiceProviders);

/**
 * @route GET /api/v1/dashboard/cp
 * @description Get content provider dashboard statistics
 * @access Private/ContentProvider, Admin
 */
router.get(
  "/cp",
  // auth([roles.CONTENT_PROVIDER, roles.ADMIN]),
  dashboard.getContentProviderDashboard
);

/**
 * @route GET /api/v1/dashboard/cp/:cpId/details
 * @description Get detailed information about a content provider
 * @access Private/Admin
 */
router.get(
  "/cp/:cpId/details",
  // auth([roles.ADMIN]),
  dashboard.getContentProviderDetails
);

/**
 * @description Get shoot overview and upcoming meetings for a content provider
 * @access Private/ContentProvider, Admin
 */
router.get(
  "/cp/:cpId/shoot-overview",
  // auth([roles.ADMIN, roles.CONTENT_PROVIDER]),
  dashboard.getShootOverviewAndMeetings
);

/**
 * @route GET /api/v1/dashboard/cp/:cpId/financial-summary
 * @description Get financial summary and shoot statistics for a content provider
 * @access Private/ContentProvider, Admin
 */
router.get(
  "/cp/:cpId/financial-summary",
  // auth([roles.ADMIN, roles.CONTENT_PROVIDER]),
  dashboard.getFinancialAndShootSummary
);

/**
 * @route GET /api/v1/dashboard/post-production
 * @description Get post-production manager dashboard data with time-based statistics
 * @access Private/PostProductionManager, Admin
 */
router.get(
  "/post-production",
  // auth([roles.ADMIN, roles.POST_PRODUCTION_MANAGER]),
  dashboard.getPostProductionDashboard
);

/**
 * @route GET /api/v1/dashboard/debug-client-orders
 * @description Debug endpoint to check what orders the dashboard sees for a client
 * @access Public (temporary for troubleshooting)
 */
router.get(
  "/debug-client-orders",
  dashboard.debugClientOrders
);

module.exports = router;
