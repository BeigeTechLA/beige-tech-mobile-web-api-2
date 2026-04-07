const express = require("express");
const auth = require("../../middlewares/auth");
const { authenticateOptional } = require("../../middlewares/auth");
const validate = require("../../middlewares/validate");
const bookingValidation = require("../../validations/booking.validation");
const bookingController = require("../../controllers/booking.controller");

const router = express.Router();

// ============================================================================
// PUBLIC ENDPOINTS (No Authentication Required)
// ============================================================================

/**
 * @route POST /api/v1/bookings/create
 * @description Create a new booking (supports both guest and authenticated users)
 * @access Public (Optional Authentication)
 */
router
  .route("/create")
  .post(
    authenticateOptional(), // Optional authentication - supports both guest and authenticated users
    validate(bookingValidation.createBooking),
    bookingController.createBooking
  );

/**
 * @route GET /api/v1/bookings/status/:bookingId
 * @description Get booking status by ID (public tracking)
 * @access Public
 */
router
  .route("/status/:bookingId")
  .get(bookingController.getBookingStatus);

/**
 * @route GET /api/v1/bookings/confirmation/:confirmationNumber
 * @description Get booking by confirmation number (public tracking)
 * @access Public
 */
router
  .route("/confirmation/:confirmationNumber")
  .get(bookingController.getBookingByConfirmation);

/**
 * @route GET /api/v1/bookings/guest
 * @description Get guest bookings by email
 * @access Public (with email verification)
 */
router
  .route("/guest")
  .get(
    validate(bookingValidation.getGuestBookings),
    bookingController.getGuestBookings
  );

/**
 * @route POST /api/v1/bookings/validate
 * @description Validate booking data (utility for form validation)
 * @access Public
 */
router
  .route("/validate")
  .post(
    validate(bookingValidation.validateBookingData),
    bookingController.validateBookingData
  );

/**
 * @route POST /api/v1/bookings/:id/verify-access
 * @description Verify client email and grant access to booking details
 * @access Public (with email verification)
 */
router
  .route("/:id/verify-access")
  .post(bookingController.verifyClientAccess);

/**
 * @route POST /api/v1/bookings/:id/associate-user
 * @description Associate a booking with the authenticated user's account
 * @access Private
 */
router
  .route("/:id/associate-user")
  .post(auth(), bookingController.associateBookingWithUser);

// ============================================================================
// AUTHENTICATED USER ENDPOINTS
// ============================================================================

/**
 * @route GET /api/v1/bookings/user
 * @description Get authenticated user's bookings
 * @access Private
 */
router
  .route("/user")
  .get(
    auth(), // Requires authentication
    bookingController.getUserBookings
  );

/**
 * @route GET /api/v1/bookings/sales
 * @description Get sales rep's bookings with shareable links
 * @access Private (Sales Rep only)
 */
router
  .route("/sales")
  .get(
    auth(), // Requires authentication
    bookingController.getSalesRepBookings
  );

/**
 * @route PATCH /api/v1/bookings/:bookingId
 * @description Update booking including guest email (open access - anyone with booking ID can update)
 * @access Public (no authentication required)
 * ⚠️ WARNING: No authentication or email verification - all fields can be updated with just booking ID
 */
router
  .route("/:bookingId")
  .patch(
    authenticateOptional(), // Optional authentication - supports both guest and authenticated users
    validate(bookingValidation.updateBooking),
    bookingController.updateBooking
  );

/**
 * @route POST /api/v1/bookings/:bookingId/cancel
 * @description Cancel booking
 * @access Private
 */
router
  .route("/:bookingId/cancel")
  .post(
    auth(), // Requires authentication
    validate(bookingValidation.cancelBooking),
    bookingController.cancelBooking
  );

// ============================================================================
// ADMIN-ONLY ENDPOINTS
// ============================================================================

/**
 * @route GET /api/v1/bookings/stats
 * @description Get booking statistics and analytics
 * @access Private (Admin only)
 */
router
  .route("/stats")
  .get(
    auth("getBookingStats"), // Admin permission required
    bookingController.getBookingStats
  );

/**
 * @route POST /api/v1/bookings/process-conversions
 * @description Process pending booking to order conversions
 * @access Private (Admin only)
 */
router
  .route("/process-conversions")
  .post(
    auth("manageBookings"), // Admin permission required
    bookingController.processPendingConversions
  );

/**
 * @route POST /api/v1/bookings/retry-syncs
 * @description Retry failed external syncs (Airtable, etc.)
 * @access Private (Admin only)
 */
router
  .route("/retry-syncs")
  .post(
    auth("manageBookings"), // Admin permission required
    bookingController.retryFailedSyncs
  );

/**
 * @route GET /api/v1/bookings/debug-booking-order
 * @description Debug endpoint to check booking-to-order mapping
 * @access Public (temporary for troubleshooting)
 */
router
  .route("/debug-booking-order")
  .get(bookingController.debugBookingToOrder);

/**
 * @route POST /api/v1/bookings/manual-convert
 * @description Manual conversion endpoint for testing
 * @access Public (temporary for troubleshooting)
 */
router
  .route("/manual-convert")
  .post(bookingController.manualConvertBooking);

/**
 * @route POST /api/v1/bookings/:bookingId/create-folders
 * @description Create folders for an existing booking/order that doesn't have folders
 * @access Private (Admin only)
 */
router
  .route("/:bookingId/create-folders")
  .post(
    auth(), // Requires authentication
    bookingController.createFoldersForBooking
  );

module.exports = router;