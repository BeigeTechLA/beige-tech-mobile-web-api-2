const Joi = require("joi");

const createBooking = {
  body: Joi.object().keys({
    // Guest information (required for all bookings)
    guestName: Joi.string().required().trim().max(100),
    guestEmail: Joi.string().email().required().trim().lowercase(),
    guestPhone: Joi.string().required().trim(),

    // Service details
    serviceType: Joi.string().valid("videography", "photography", "editing_only", "all", "shoot-edit", "shoot-raw").required(),
    contentType: Joi.array().items(Joi.string().valid("photo", "video", "edit", "all", "videography", "photography")).min(1).required(),
    shootType: Joi.string().optional().trim(),
    editType: Joi.string().optional().trim(),

    // Schedule information
    startDateTime: Joi.date().iso().required(),
    endDateTime: Joi.date().iso().greater(Joi.ref("startDateTime")).required(),
    durationHours: Joi.number().min(0.5).optional(),

    // Location details
    location: Joi.string().required().trim(),
    needStudio: Joi.boolean().optional().default(false),

    // Pricing information
    budget: Joi.number().min(0).required(),
    totalAmount: Joi.number().min(0).optional(),

    // Sales representative (optional)
    salesRepId: Joi.string().optional(),

    // Additional details
    description: Joi.string().optional().max(1000),
    references: Joi.string().optional().max(500),
  }),
};

const updateBooking = {
  params: Joi.object().keys({
    bookingId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    // Guest information updates
    guestName: Joi.string().optional().trim().max(100),
    guestPhone: Joi.string().optional().trim(),
    guestEmail: Joi.string().email().optional().trim().lowercase(),

    // Service details updates
    serviceType: Joi.string().valid("videography", "photography", "editing_only", "all", "shoot-edit", "shoot-raw").optional(),
    contentType: Joi.array().items(Joi.string().valid("photo", "video", "edit", "all")).min(1).optional(),
    shootType: Joi.string().optional().trim(),
    editType: Joi.string().optional().trim(),

    // Schedule updates
    startDateTime: Joi.date().iso().optional(),
    endDateTime: Joi.date().iso().optional(),
    durationHours: Joi.number().min(0.5).optional(),

    // Location updates
    location: Joi.string().optional().trim(),
    needStudio: Joi.boolean().optional(),

    // Pricing updates
    budget: Joi.number().min(0).optional(),

    // Additional details updates
    description: Joi.string().optional().max(1000),
    references: Joi.string().optional().max(500),
  }),
};

const getGuestBookings = {
  query: Joi.object().keys({
    email: Joi.string().email().required(),
    status: Joi.string().valid("pending", "confirmed", "paid", "converted", "cancelled").optional(),
    paymentStatus: Joi.string().valid("pending", "processing", "paid", "failed", "refunded").optional(),
    serviceType: Joi.string().valid("videography", "photography", "editing_only", "all", "shoot-edit", "shoot-raw").optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(50).optional(),
    page: Joi.number().integer().min(1).optional(),
  }),
};

const cancelBooking = {
  params: Joi.object().keys({
    bookingId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().optional().max(500),
  }),
};

const validateBookingData = {
  body: Joi.object().keys({
    // Same validation as createBooking but all fields optional for partial validation
    guestName: Joi.string().optional().trim().max(100),
    guestEmail: Joi.string().email().optional().trim().lowercase(),
    guestPhone: Joi.string().optional().trim(),
    serviceType: Joi.string().valid("videography", "photography", "editing_only", "all", "shoot-edit", "shoot-raw").optional(),
    contentType: Joi.array().items(Joi.string().valid("photo", "video", "edit", "all", "videography", "photography")).min(1).optional(),
    shootType: Joi.string().optional().trim(),
    editType: Joi.string().optional().trim(),
    startDateTime: Joi.date().iso().optional(),
    endDateTime: Joi.date().iso().optional(),
    durationHours: Joi.number().min(0.5).optional(),
    location: Joi.string().optional().trim(),
    needStudio: Joi.boolean().optional(),
    budget: Joi.number().min(0).optional(),
    description: Joi.string().optional().max(1000),
    references: Joi.string().optional().max(500),
  }),
};

// Params validation for various endpoints
const bookingIdParam = {
  params: Joi.object().keys({
    bookingId: Joi.string().required(),
  }),
};

const confirmationNumberParam = {
  params: Joi.object().keys({
    confirmationNumber: Joi.string().required(),
  }),
};

module.exports = {
  createBooking,
  updateBooking,
  getGuestBookings,
  cancelBooking,
  validateBookingData,
  bookingIdParam,
  confirmationNumberParam,
};