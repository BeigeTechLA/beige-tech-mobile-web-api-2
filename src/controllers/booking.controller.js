const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { bookingService, stripeService } = require("../services");
const logger = require("../config/logger");

/**
 * Create booking and Stripe checkout session
 * Supports both guest and authenticated users
 */
const createBooking = catchAsync(async (req, res) => {
  const userId = req.user?.id || null; // Optional authentication
  const bookingData = req.body;
  let isSalesRep = false;

  // If user is authenticated, check their role
  if (userId) {
    const User = require('../models/user.model');
    const user = await User.findById(userId);

    // Block CP (Content Provider) users from creating bookings
    if (user && user.role === 'cp') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Content providers cannot create bookings. Only clients can book services.'
      );
    }

    if (user && user.role === 'sales_representative') {
      bookingData.salesRepId = userId;
      isSalesRep = true;
    }
  }

  // Extract client metadata for tracking
  const options = {
    sourceChannel: "web",
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get("User-Agent"),
  };

  // Validate required fields early
  const requiredFields = ["guestName", "guestEmail", "guestPhone", "serviceType",
                         "contentType", "startDateTime", "endDateTime", "location"];

  for (const field of requiredFields) {
    if (!bookingData[field]) {
      throw new ApiError(httpStatus.BAD_REQUEST, `${field} is required`);
    }
  }

  try {
    // Create booking in database
    // IMPORTANT: If sales rep is creating booking for a guest client, pass null as userId
    // Only pass userId if it's the actual client booking for themselves
    const clientUserId = isSalesRep ? null : userId;
    const booking = await bookingService.createBooking(bookingData, clientUserId, options);

    // Create Stripe checkout session with booking metadata
    // IMPORTANT: Pass clientUserId (null for sales rep bookings), not the authenticated userId
    const session = await stripeService.createCheckoutSession(
      {
        ...bookingData,
        amount: booking.totalAmount || booking.budget,
        bookingId: booking._id.toString(), // Include booking ID for webhook processing
      },
      clientUserId || "guest",
      booking._id.toString()
    );

    // Update booking with Stripe session reference
    await bookingService.updateBookingById(booking._id, {
      stripeSessionId: session.id,
    });

    logger.info(`Booking and checkout session created: ${booking._id}`, {
      bookingId: booking._id,
      sessionId: session.id,
      clientUserId: clientUserId || 'guest',
      authenticatedUserId: userId || 'guest',
      isSalesRep: isSalesRep,
      salesRepId: booking.salesRepId,
      guestEmail: bookingData.guestEmail,
    });

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Booking created and payment session initialized",
      data: {
        booking: {
          id: booking._id,
          confirmationNumber: booking.confirmationNumber,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          serviceType: booking.serviceType,
          startDateTime: booking.startDateTime,
          location: booking.location,
          totalAmount: booking.totalAmount || booking.budget,
          createdAt: booking.createdAt,
        },
        payment: {
          sessionId: session.id,
          url: session.url,
        },
      },
    });
  } catch (error) {
    logger.error("Booking creation failed:", {
      error: error.message,
      userId,
      guestEmail: bookingData.guestEmail,
    });
    throw error;
  }
});

/**
 * Get booking status by ID (public endpoint for order tracking)
 */
const getBookingStatus = catchAsync(async (req, res) => {
  const { bookingId } = req.params;

  const booking = await bookingService.getBookingById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Return only public information for status checking
  const publicBookingInfo = {
    id: booking._id,
    confirmationNumber: booking.confirmationNumber,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    guestName: booking.guestName,
    serviceType: booking.serviceType,
    contentType: booking.contentType,
    startDateTime: booking.startDateTime,
    endDateTime: booking.endDateTime,
    location: booking.location,
    totalAmount: booking.totalAmount || booking.budget,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };

  // Include order information if converted
  if (booking.orderId) {
    publicBookingInfo.orderId = booking.orderId;
    publicBookingInfo.convertedAt = booking.convertedAt;
  }

  res.json({
    success: true,
    message: "Booking status retrieved successfully",
    data: publicBookingInfo,
  });
});

/**
 * Get user bookings (authenticated users only)
 */
const getUserBookings = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const filter = pick(req.query, ["status", "paymentStatus", "serviceType"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  // Add user filter
  filter.userId = userId;

  const result = await bookingService.queryBookings(filter, options);

  // Transform result for API response
  const bookingsWithSummary = {
    ...result,
    results: result.results.map(booking => booking.getSummary()),
  };

  res.json({
    success: true,
    message: "User bookings retrieved successfully",
    data: bookingsWithSummary,
  });
});

/**
 * Get guest bookings by email (with email verification)
 */
const getGuestBookings = catchAsync(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email is required");
  }

  const filter = pick(req.query, ["status", "paymentStatus", "serviceType"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  // Add guest email filter
  filter.guestEmail = email.toLowerCase();
  filter.userId = null; // Ensure guest-only bookings

  const result = await bookingService.queryBookings(filter, options);

  // Transform result for API response
  const bookingsWithSummary = {
    ...result,
    results: result.results.map(booking => booking.getSummary()),
  };

  res.json({
    success: true,
    message: "Guest bookings retrieved successfully",
    data: bookingsWithSummary,
  });
});

/**
 * Update booking including guest email (open access - anyone with booking ID can update)
 * ⚠️ WARNING: No authentication or email verification required - all fields including guestEmail can be updated
 */
const updateBooking = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const updateData = req.body;
  const userId = req.user?.id; // Optional for guest users
  const userRole = req.user?.role;

  // Get existing booking
  const existingBooking = await bookingService.getBookingById(bookingId);
  if (!existingBooking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Restrict certain fields based on booking status (only for non-admin users)
  if (existingBooking.status === 'paid' || existingBooking.status === 'converted') {
    const restrictedFields = ['serviceType', 'contentType', 'startDateTime', 'endDateTime', 'budget'];
    const hasRestrictedUpdates = restrictedFields.some(field => updateData[field] !== undefined);

    if (hasRestrictedUpdates && userRole !== 'admin') {
      throw new ApiError(httpStatus.BAD_REQUEST,
        "Cannot modify service details for paid or converted bookings");
    }
  }

  const updatedBooking = await bookingService.updateBookingById(bookingId, updateData);

  logger.info(`Booking updated: ${bookingId}`, {
    bookingId,
    userId: userId || 'guest',
    authenticationType: userId ? 'authenticated' : 'unauthenticated',
    updatedFields: Object.keys(updateData),
  });

  res.json({
    success: true,
    message: "Booking updated successfully",
    data: updatedBooking.getSummary(),
  });
});

/**
 * Cancel booking (users and admins)
 */
const cancelBooking = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id;
  const userRole = req.user?.role;

  const booking = await bookingService.getBookingById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Check permission
  if (userRole !== 'admin' && booking.userId?.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, "You can only cancel your own bookings");
  }

  // Check if booking can be cancelled
  if (!booking.canBeCancelled()) {
    throw new ApiError(httpStatus.BAD_REQUEST,
      "Booking cannot be cancelled. It may be too close to the scheduled date or already processed");
  }

  const updateData = {
    status: "cancelled",
    cancellationReason: reason || "Cancelled by user",
    cancelledAt: new Date(),
    cancelledBy: userId || 'guest',
  };

  const cancelledBooking = await bookingService.updateBookingById(bookingId, updateData);

  // TODO: Handle refund logic here if applicable
  // TODO: Notify ops team via Airtable update

  logger.info(`Booking cancelled: ${bookingId}`, {
    bookingId,
    userId: userId || 'guest',
    reason,
  });

  res.json({
    success: true,
    message: "Booking cancelled successfully",
    data: cancelledBooking.getSummary(),
  });
});

/**
 * Get booking analytics/stats (admin only)
 */
const getBookingStats = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["serviceType", "status", "paymentStatus", "startDate", "endDate"]);

  // Date range filtering
  if (filter.startDate || filter.endDate) {
    const dateFilter = {};
    if (filter.startDate) {
      dateFilter.$gte = new Date(filter.startDate);
    }
    if (filter.endDate) {
      dateFilter.$lte = new Date(filter.endDate);
    }
    filter.createdAt = dateFilter;
    delete filter.startDate;
    delete filter.endDate;
  }

  const stats = await bookingService.queryBookings({ ...filter }, {});
  const bookingStats = await require("../models/booking.model").getStats(filter);

  res.json({
    success: true,
    message: "Booking statistics retrieved successfully",
    data: {
      overview: bookingStats,
      totalCount: stats.totalResults,
      currentPage: stats.page,
      totalPages: stats.totalPages,
    },
  });
});

/**
 * Process pending conversions (admin/system endpoint)
 */
const processPendingConversions = catchAsync(async (req, res) => {
  const results = await bookingService.processPendingConversions();

  logger.info("Manual conversion processing initiated", {
    userId: req.user?.id,
    results,
  });

  res.json({
    success: true,
    message: "Pending conversions processed",
    data: results,
  });
});

/**
 * Retry failed syncs (admin/system endpoint)
 */
const retryFailedSyncs = catchAsync(async (req, res) => {
  const { service = 'airtable' } = req.query;

  const results = await bookingService.retryFailedSyncs(service);

  logger.info("Manual sync retry initiated", {
    userId: req.user?.id,
    service,
    results,
  });

  res.json({
    success: true,
    message: `Failed ${service} syncs retried`,
    data: results,
  });
});

/**
 * Get booking by confirmation number (public endpoint)
 */
const getBookingByConfirmation = catchAsync(async (req, res) => {
  const { confirmationNumber } = req.params;

  const booking = await bookingService.queryBookings({ confirmationNumber }, { limit: 1 });

  if (!booking.results.length) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found with this confirmation number");
  }

  const bookingData = booking.results[0];

  res.json({
    success: true,
    message: "Booking retrieved successfully",
    data: bookingData.getSummary(),
  });
});

/**
 * Manual conversion endpoint for testing (temporary for troubleshooting)
 */
const manualConvertBooking = catchAsync(async (req, res) => {
  const { bookingId } = req.body;

  if (!bookingId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "bookingId is required");
  }

  try {
    // First update the booking to paid status if not already
    const booking = await bookingService.getBookingById(bookingId);
    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }

    console.log(`🔧 Manual conversion attempt for booking ${bookingId}:`, {
      currentStatus: booking.status,
      paymentStatus: booking.paymentStatus,
      userId: booking.userId,
      canBeConverted: booking.canBeConverted()
    });

    if (booking.status !== 'paid') {
      await bookingService.updateBookingById(bookingId, {
        status: 'paid',
        paymentStatus: 'paid'
      });
      console.log(`✅ Updated booking ${bookingId} to paid status`);
    }

    // Convert to order
    const order = await bookingService.convertBookingToOrder(bookingId);

    res.json({
      success: true,
      message: "Manual booking conversion completed",
      data: {
        bookingId: booking._id,
        orderId: order._id,
        mapping: {
          bookingUserId: booking.userId,
          orderClientId: order.client_id
        }
      }
    });
  } catch (error) {
    console.error(`❌ Manual conversion failed for ${bookingId}:`, error.message);
    throw error;
  }
});

/**
 * Debug endpoint to check booking-order mapping (temporary for troubleshooting)
 */
const debugBookingToOrder = catchAsync(async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "userId is required");
  }

  // Get bookings for this user
  const bookings = await bookingService.queryBookings({ userId }, { limit: 10, sortBy: 'createdAt:desc' });

  // Get orders for this user
  const Order = require("../models/order.model");
  const orders = await Order.find({ client_id: userId }).sort({ createdAt: -1 }).limit(10);

  // Get converted bookings
  const convertedBookings = await bookingService.queryBookings(
    { userId, status: 'converted' },
    { limit: 10, sortBy: 'createdAt:desc' }
  );

  res.json({
    success: true,
    message: "Debug info retrieved",
    data: {
      userId,
      bookings: {
        total: bookings.totalResults,
        results: bookings.results.map(b => ({
          id: b._id,
          userId: b.userId,
          status: b.status,
          paymentStatus: b.paymentStatus,
          orderId: b.orderId,
          guestEmail: b.guestEmail,
          createdAt: b.createdAt
        }))
      },
      orders: {
        total: orders.length,
        results: orders.map(o => ({
          id: o._id,
          client_id: o.client_id,
          booking_ref: o.booking_ref,
          guest_info: o.guest_info,
          booking_source: o.booking_source,
          createdAt: o.createdAt
        }))
      },
      convertedBookings: {
        total: convertedBookings.totalResults,
        results: convertedBookings.results.map(b => ({
          id: b._id,
          userId: b.userId,
          orderId: b.orderId,
          convertedAt: b.convertedAt
        }))
      }
    }
  });
});

/**
 * Validate booking data (utility endpoint for form validation)
 */
const validateBookingData = catchAsync(async (req, res) => {
  const bookingData = req.body;

  try {
    // Run validation logic without actually creating booking
    const requiredFields = ["guestName", "guestEmail", "guestPhone", "serviceType",
                           "contentType", "startDateTime", "endDateTime", "location"];

    const missingFields = requiredFields.filter(field => !bookingData[field]);

    if (missingFields.length > 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Validation failed",
        errors: missingFields.map(field => ({
          field,
          message: `${field} is required`
        })),
      });
    }

    // Date validation
    const startDate = new Date(bookingData.startDateTime);
    const endDate = new Date(bookingData.endDateTime);
    const now = new Date();

    const errors = [];

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push({ field: "dateTime", message: "Invalid date format" });
    } else {
      if (startDate >= endDate) {
        errors.push({ field: "endDateTime", message: "End date must be after start date" });
      }
      if (startDate < now) {
        errors.push({ field: "startDateTime", message: "Start date cannot be in the past" });
      }
    }

    if (errors.length > 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    res.json({
      success: true,
      message: "Booking data is valid",
      data: {
        isValid: true,
        durationHours: (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60),
      },
    });
  } catch (error) {
    logger.error("Booking validation error:", error);
    throw new ApiError(httpStatus.BAD_REQUEST, "Validation failed");
  }
});

/**
 * Get all bookings for logged-in sales rep
 */
const getSalesRepBookings = catchAsync(async (req, res) => {
  const salesRepId = req.user.id;
  const userRole = req.user.role;

  // Verify user is a sales rep (handle both 'sales_rep' and 'sales_representative')
  if (userRole !== 'sales_rep' && userRole !== 'sales_representative') {
    throw new ApiError(httpStatus.FORBIDDEN, "Only sales reps can access this endpoint");
  }

  // Get all bookings created by this sales rep
  const bookings = await bookingService.queryBookings(
    { salesRepId },
    {
      sortBy: 'createdAt:desc',
      limit: 100,
    }
  );

  // Calculate total revenue from paid bookings
  const paidBookings = bookings.results.filter(b => b.paymentStatus === 'paid');
  const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.manualPrice || b.totalAmount || b.budget), 0);

  // Generate shareable links for each booking
  const bookingsWithLinks = bookings.results.map(booking => ({
    _id: booking._id.toString(),
    id: booking._id.toString(), // Include both for compatibility
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    serviceType: booking.serviceType,
    contentType: booking.contentType,
    startDateTime: booking.startDateTime,
    durationHours: booking.durationHours,
    location: booking.location,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    manualPrice: booking.manualPrice,
    totalAmount: booking.totalAmount || booking.budget,
    confirmationNumber: booking.confirmationNumber,
    createdAt: booking.createdAt,
    shareableLink: `${process.env.CLIENT_URL}/order?id=${booking._id}`
  }));

  logger.info(`Sales rep bookings retrieved: ${salesRepId}`, {
    salesRepId,
    totalBookings: bookings.totalResults,
    totalRevenue,
  });

  res.json({
    success: true,
    message: "Sales rep bookings retrieved successfully",
    data: {
      bookings: bookingsWithLinks,
      stats: {
        totalBookings: bookings.totalResults,
        totalRevenue,
        paidBookings: paidBookings.length,
      },
    },
  });
});

/**
 * Verify client email and grant access to booking details
 */
const verifyClientAccess = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;

  if (!email) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email is required");
  }

  // Get booking by ID
  const booking = await bookingService.getBookingById(id);

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Verify email matches (case-insensitive)
  if (booking.guestEmail.toLowerCase() !== email.toLowerCase()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Email does not match booking records");
  }

  // Populate sales rep details if exists
  let salesRepInfo = null;
  if (booking.salesRepId) {
    await booking.populate('salesRepId', 'name email');
    salesRepInfo = booking.salesRepId ? {
      name: booking.salesRepId.name,
      email: booking.salesRepId.email,
    } : null;
  }

  logger.info(`Client access granted for booking: ${id}`, {
    bookingId: id,
    email: email,
    salesRepId: booking.salesRepId,
  });

  res.json({
    success: true,
    message: "Access granted",
    data: {
      booking: {
        id: booking._id,
        confirmationNumber: booking.confirmationNumber,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        guestPhone: booking.guestPhone,
        serviceType: booking.serviceType,
        contentType: booking.contentType,
        shootType: booking.shootType,
        editType: booking.editType,
        startDateTime: booking.startDateTime,
        endDateTime: booking.endDateTime,
        durationHours: booking.durationHours,
        location: booking.location,
        needStudio: booking.needStudio,
        description: booking.description,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        manualPrice: booking.manualPrice,
        totalAmount: booking.totalAmount || booking.budget,
        createdAt: booking.createdAt,
        userId: booking.userId ? booking.userId.toString() : undefined,
        salesRep: salesRepInfo,
      },
    },
  });
});

/**
 * Associate a booking with the authenticated user's account
 */
const associateBookingWithUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Get user details
  const User = require('../models/user.model');
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  // Get booking by ID
  const booking = await bookingService.getBookingById(id);

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Verify that the booking's email matches the user's email
  if (booking.guestEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Cannot associate booking - email does not match your account"
    );
  }

  // Check if booking is already associated with a different user
  if (booking.userId && booking.userId.toString() !== userId) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "This booking is already associated with another account"
    );
  }

  // If already associated with this user, return success (idempotent)
  if (booking.userId && booking.userId.toString() === userId) {
    logger.info(`Booking already associated with user: ${id}`, {
      bookingId: id,
      userId: userId,
      userEmail: user.email,
    });

    return res.json({
      success: true,
      message: "Booking is already associated with your account",
      data: {
        bookingId: booking._id,
        userId: userId,
      },
    });
  }

  // Update booking with userId
  booking.userId = userId;
  await booking.save();

  // Also update any associated Order with the client_id
  const Order = require('../models/order.model');
  const order = await Order.findOne({ booking_ref: booking._id });

  if (order) {
    // Update order's client_id to match the user
    order.client_id = userId;
    await order.save();

    logger.info(`Order also associated with user: ${order._id}`, {
      orderId: order._id,
      bookingId: id,
      userId: userId,
    });
  }

  logger.info(`Booking associated with user: ${id}`, {
    bookingId: id,
    userId: userId,
    userEmail: user.email,
    orderUpdated: !!order,
  });

  res.json({
    success: true,
    message: "Booking successfully associated with your account",
    data: {
      bookingId: booking._id,
      userId: userId,
      orderUpdated: !!order,
    },
  });
});

/**
 * Create folders for an existing booking/order that doesn't have folders
 * This is a utility endpoint for fixing bookings that were created before folder creation was implemented
 */
const createFoldersForBooking = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const { Booking, Order } = require("../models");
  const gcpFileService = require("../services/gcpFile.service");
  const getLastFiveChars = require("../utils/getLastFiveCharc");

  // Find the booking
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Check if booking has an order
  if (!booking.orderId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Booking has not been converted to an order yet. Please complete payment first."
    );
  }

  // Find the order
  const order = await Order.findById(booking.orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found for this booking");
  }

  // Check if folder already exists
  if (order.file_path && order.file_path.dir_name) {
    // Verify folder exists in GCS
    const existingFolderPath = `shoots/${order.file_path.dir_name}/`;
    const file = gcpFileService.bucket.file(existingFolderPath);
    const [exists] = await file.exists();

    if (exists) {
      return res.json({
        success: true,
        message: "Folder already exists for this order",
        data: {
          orderId: order._id,
          folderPath: order.file_path.dir_name,
          alreadyExists: true,
        },
      });
    }
  }

  // Create folder name
  const inCluededOrderId = getLastFiveChars(order._id.toString());

  // Get user name for folder naming
  let userName = "User";
  if (booking.userId) {
    try {
      const userService = require("../services/user.service");
      const client = await userService.getUserById(booking.userId);
      if (client && client.name) {
        userName = client.name.split(" ")[0];
      }
    } catch (error) {
      logger.error("Error fetching client name:", { error: error.message });
    }
  } else if (booking.guestName) {
    userName = booking.guestName.split(" ")[0];
  }

  const serviceType = booking.serviceType || "Photography";
  const file_path = `${userName}'s ${serviceType}_${inCluededOrderId}`;

  logger.info(`Creating folder for existing order: ${file_path}`, {
    bookingId: booking._id,
    orderId: order._id,
    folderPath: file_path,
  });

  try {
    // Create main shoots folder
    await gcpFileService.createFolder(
      file_path,
      order.cp_ids,
      order._id,
      order.client_id || booking.userId
    );

    // Create chat folder
    await gcpFileService.createChatFolder(
      file_path,
      order.cp_ids,
      order._id,
      order.client_id || booking.userId
    );

    // Update order with folder path
    await Order.findByIdAndUpdate(order._id, {
      file_path: {
        status: false,
        dir_name: file_path,
      },
    });

    logger.info(`Folders created successfully for order: ${order._id}`, {
      folderPath: file_path,
    });

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Folders created successfully",
      data: {
        bookingId: booking._id,
        orderId: order._id,
        folderPath: file_path,
      },
    });
  } catch (folderError) {
    logger.error("Failed to create folders:", {
      orderId: order._id,
      error: folderError.message,
    });
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create folders: ${folderError.message}`
    );
  }
});

module.exports = {
  createBooking,
  getBookingStatus,
  getUserBookings,
  getGuestBookings,
  updateBooking,
  cancelBooking,
  getBookingStats,
  processPendingConversions,
  retryFailedSyncs,
  getBookingByConfirmation,
  validateBookingData,
  debugBookingToOrder,
  manualConvertBooking,
  getSalesRepBookings,
  verifyClientAccess,
  associateBookingWithUser,
  createFoldersForBooking,
};