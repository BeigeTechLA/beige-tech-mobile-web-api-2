const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { Booking, Order, User } = require("../models");
const ApiError = require("../utils/ApiError");
const logger = require("../config/logger");
const monitoringService = require("./monitoring.service");
const { retryMongoOperation, retrySimpleOperation } = require("../utils/retry");
const gcpFileService = require("./gcpFile.service");
const getLastFiveChars = require("../utils/getLastFiveCharc");

/**
 * Generate a unique shoot ID
 * Starts with 3 digits (100-999), expands to 4 digits (1000-9999), then 5 digits, etc.
 * Checks existing shoot_ids to ensure uniqueness
 */
const generateUniqueShootId = async () => {
  let shootId;
  let isUnique = false;
  let currentDigits = 3; // Start with 3 digits
  const maxDigits = 6; // Max 6 digits (100000-999999)

  while (!isUnique && currentDigits <= maxDigits) {
    const min = Math.pow(10, currentDigits - 1); // 100, 1000, 10000, etc.
    const max = Math.pow(10, currentDigits) - 1; // 999, 9999, 99999, etc.
    let attempts = 0;
    const maxAttempts = 50; // Try 50 random numbers per digit range

    while (!isUnique && attempts < maxAttempts) {
      // Generate random number within current digit range
      shootId = String(Math.floor(min + Math.random() * (max - min + 1)));

      // Check if it already exists
      const existing = await Order.findOne({ shoot_id: shootId });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    // If not found in current digit range, move to next digit range
    if (!isUnique) {
      currentDigits++;
    }
  }

  // Ultimate fallback: use timestamp-based ID
  if (!isUnique) {
    shootId = String(Date.now()).slice(-6);
  }

  return shootId;
};

/**
 * Format client name for shoot naming convention
 * Converts "Lana Guzman" to "Lana_Guzman"
 */
const formatClientNameForShoot = (clientName) => {
  if (!clientName) return "Unknown";
  return clientName.replace(/\s+/g, '_');
};

/**
 * Generate order name in the format: ShootType_ClientName_ShootID
 * @param {string} clientName - The client's name
 * @param {string} shootId - The unique shoot ID
 * @param {string} shootType - The shoot type (e.g., "Lifestyle", "Brand Campaign", "brand-campaign", etc.)
 */
const generateOrderName = (clientName, shootId, shootType = "Photography") => {
  const formattedName = formatClientNameForShoot(clientName);

  // Format shoot type: convert hyphens to spaces, then to title case, then replace spaces with underscores
  // This handles both "brand-campaign" and "Brand Campaign" formats
  let formattedShootType = shootType
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('_');

  return `${formattedShootType}_${formattedName}_${shootId}`;
};

/**
 * Create a booking with optional authentication and Airtable sync
 * Includes retry logic for handling duplicate confirmation number errors
 * @param {Object} bookingData - Booking data
 * @param {string} userId - User ID (optional for guest bookings)
 * @param {Object} options - Additional options
 * @returns {Promise<Booking>}
 */
const createBooking = async (bookingData, userId = null, options = {}) => {
  const maxRetries = 3;
  let lastError = null;

  // Retry loop to handle potential duplicate key errors
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const session = await mongoose.startSession();

    try {
      await session.startTransaction();

      // Validate required fields
      if (
        !bookingData.guestName ||
        !bookingData.guestEmail ||
        !bookingData.guestPhone
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Guest information is required"
        );
      }

      if (!bookingData.serviceType || !bookingData.contentType) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Service and content type are required"
        );
      }

      if (!bookingData.startDateTime || !bookingData.endDateTime) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Start and end date times are required"
        );
      }

      if (!bookingData.location) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Location is required");
      }

      // Validate date logic
      const startDate = new Date(bookingData.startDateTime);
      const endDate = new Date(bookingData.endDateTime);
      const now = new Date();

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid date format");
      }

      if (startDate >= endDate) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "End date time must be after start date time"
        );
      }

      if (startDate < now) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Start date time cannot be in the past"
        );
      }

      // Calculate duration if not provided
      const durationHours =
        bookingData.durationHours ||
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

      // Prepare booking document
      const bookingDoc = {
        ...bookingData,
        userId: userId || null,
        durationHours,
        status: "confirmed", // Set to confirmed so confirmation number gets generated
        paymentStatus: "pending",
        guestEmail: bookingData.guestEmail.toLowerCase(),
        sourceChannel: options.sourceChannel || "web",
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      };

      // Create booking
      const [booking] = await Booking.create([bookingDoc], { session });

      // Log booking creation
      logger.info(`Booking created: ${booking._id}`, {
        bookingId: booking._id,
        userId: userId || "guest",
        guestEmail: bookingData.guestEmail,
        serviceType: bookingData.serviceType,
        confirmationNumber: booking.confirmationNumber,
        attempt: attempt + 1,
      });

      // Track booking creation event
      monitoringService.trackBookingEvent("created", {
        id: booking._id,
        userId: userId || "guest",
        serviceType: bookingData.serviceType,
        amount: bookingDoc.totalAmount,
        status: "pending",
      });

      await session.commitTransaction();

      // Async operations after successful creation
      setImmediate(async () => {
        try {
          // Create Airtable record for ops team
          if (!options.skipAirtableSync) {
            await createAirtableRecord(booking);
          }
        } catch (error) {
          logger.error("Failed to sync booking to Airtable:", {
            bookingId: booking._id,
            error: error.message,
          });
          // Update booking with sync error info
          await Booking.findByIdAndUpdate(booking._id, {
            "lastSyncError.airtable": error.message,
            "syncAttempts.airtable": 1,
          });
        }
      });

      return booking;
    } catch (error) {
      await session.abortTransaction();

      // Check if this is a duplicate key error on confirmationNumber
      const isDuplicateConfirmationError =
        error.code === 11000 &&
        error.message.includes("confirmationNumber");

      if (isDuplicateConfirmationError && attempt < maxRetries - 1) {
        // Log retry attempt
        logger.warn(`Duplicate confirmation number detected, retrying... (attempt ${attempt + 1}/${maxRetries})`, {
          userId,
          guestEmail: bookingData.guestEmail,
          error: error.message,
        });

        lastError = error;

        // Add exponential backoff before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));

        // Continue to next retry attempt
        continue;
      }

      // If it's not a retryable error or we've exhausted retries, log and throw
      logger.error("Booking creation failed:", {
        error: error.message,
        code: error.code,
        userId,
        guestEmail: bookingData.guestEmail,
        attempt: attempt + 1,
        maxRetries,
      });

      throw error;
    } finally {
      await session.endSession();
    }
  }

  // If we've exhausted all retries, throw the last error
  logger.error("Booking creation failed after all retry attempts:", {
    error: lastError?.message,
    userId,
    guestEmail: bookingData.guestEmail,
    maxRetries,
  });

  throw new ApiError(
    httpStatus.INTERNAL_SERVER_ERROR,
    "Failed to create booking after multiple attempts. Please try again."
  );
};

/**
 * Query for bookings
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryBookings = async (filter, options) => {
  const bookings = await Booking.paginate(filter, options);
  return bookings;
};

/**
 * Get booking by id
 * @param {ObjectId} id
 * @returns {Promise<Booking>}
 */
const getBookingById = async (id) => {
  return Booking.findById(id);
};

/**
 * Update booking by id
 * @param {ObjectId} bookingId
 * @param {Object} updateBody
 * @returns {Promise<Booking>}
 */
const updateBookingById = async (bookingId, updateBody) => {
  return retrySimpleOperation(
    async () => {
      const booking = await getBookingById(bookingId);
      if (!booking) {
        throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
      }

      // Validate date logic if dates are being updated
      if (updateBody.startDateTime || updateBody.endDateTime) {
        const startDate = new Date(
          updateBody.startDateTime || booking.startDateTime
        );
        const endDate = new Date(updateBody.endDateTime || booking.endDateTime);

        if (startDate >= endDate) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "End date must be after start date"
          );
        }
      }

      Object.assign(booking, updateBody);
      booking.updatedAt = new Date();
      await booking.save();
      return booking;
    },
    {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
    }
  );
};

/**
 * Delete booking by id
 * @param {ObjectId} bookingId
 * @returns {Promise<Booking>}
 */
const deleteBookingById = async (bookingId) => {
  const booking = await getBookingById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }
  await booking.remove();
  return booking;
};

/**
 * Convert paid booking to order with transaction safety
 * @param {string} bookingId - Booking ID to convert
 * @returns {Promise<Order>} Created order
 */
const convertBookingToOrder = async (bookingId) => {
  return retryMongoOperation(
    async (session) => {
      const booking = await Booking.findById(bookingId).session(session);
      if (!booking) {
        throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
      }

      // Validate booking eligibility for conversion
      if (!booking.canBeConverted()) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Booking cannot be converted. Status: ${booking.status}, Payment: ${
            booking.paymentStatus
          }, Order exists: ${!!booking.orderId}`
        );
      }

      // DEBUG: Log the mapping to help troubleshoot dashboard issue
      console.log(`🔄 Converting booking ${booking._id} to order:`, {
        bookingUserId: booking.userId,
        bookingSalesRepId: booking.salesRepId,
        orderClientId: booking.userId || null,
        orderCpIds: booking.salesRepId ? [booking.salesRepId] : [],
        isAuthenticated: booking.isAuthenticated,
        guestEmail: booking.guestEmail,
        note: booking.userId ? 'Authenticated booking - client has account' : 'Guest booking - client has no account yet',
      });

      // Prepare order data matching Order model structure
      const orderData = {
        // IMPORTANT: client_id should only be set if the booking has a userId
        // If a sales rep created the booking, userId will be null and client_id should be null
        // The client can later claim this order by signing up with the booking's guestEmail
        client_id: booking.userId || null, // null for guest bookings

        // Guest info for non-authenticated users
        guest_info: booking.userId
          ? null
          : {
              name: booking.guestName,
              email: booking.guestEmail,
              phone: booking.guestPhone,
            },

        // Service details
        service_type: booking.serviceType,
        content_type: Array.isArray(booking.contentType)
          ? booking.contentType
          : [booking.contentType],
        shoot_type: booking.shootType,

        // Content provider IDs - add salesRepId if exists
        cp_ids: booking.salesRepId
          ? [{
              id: booking.salesRepId,
              decision: "pending"
            }]
          : [],

        // Schedule mapping
        shoot_datetimes: [
          {
            start_date_time: booking.startDateTime,
            end_date_time: booking.endDateTime,
            duration: booking.durationHours,
            date_status: "confirmed",
          },
        ],

        // Location and budget
        location: booking.location,
        geo_location: {
          type: "Point",
          coordinates: [0, 0], // Default coordinates - TODO: enhance with actual geocoding
        },
        budget: {
          suggested: booking.totalAmount || booking.budget,
          min: Math.min(booking.budget, booking.totalAmount || booking.budget),
          max: Math.max(
            booking.budget * 1.5,
            booking.totalAmount || booking.budget
          ),
        },

        // Pricing
        shoot_cost: booking.totalAmount || booking.budget,

        // Generate unique shoot_id and order_name in ClientName_ShootID format
        shoot_id: await generateUniqueShootId(),

        // Order metadata - will be set below after shoot_id is generated
        description:
          booking.description || `Converted from booking ${booking._id}`,
        references: booking.references,

        // Status and payment
        order_status: "pending",
        payment: {
          payment_status: "paid",
          amount_paid: booking.totalAmount || booking.budget,
          amount_remaining: 0,
        },

        // Booking reference
        booking_ref: booking._id,
      };

      // Generate order_name in ShootType_ClientName_ShootID format (e.g., "Lifestyle_Alamin_Biswas_Plabon_123")
      const shootType = booking.shootType || booking.serviceType || "Photography";
      orderData.order_name = generateOrderName(booking.guestName, orderData.shoot_id, shootType);

      // Create order
      const [order] = await Order.create([orderData], { session });

      // Update booking with order reference and conversion status
      await Booking.findByIdAndUpdate(
        bookingId,
        {
          orderId: order._id,
          status: "converted",
          convertedAt: new Date(),
          conversionNote: `Converted to order ${order._id}`,
        },
        { session }
      );

      // ============================================================
      // CHAT ROOM - NOT AUTO-CREATED
      // Chat is created when admin clicks "Start Messaging" in Shoot Details
      // This allows admin to select participants before starting the conversation
      // ============================================================

      // ============================================================
      // CREATE FOLDER IN GCP BUCKET FOR ORDER
      // Folder naming format: "{ShootType}_{ClientName}_{ShootID}"
      // Example: "Lifestyle_John_123"
      // ============================================================
      const inCluededOrderId = getLastFiveChars(order._id.toString());

      // Get user name for folder naming (use guest name if no userId)
      let userName = "User";
      if (booking.userId) {
        try {
          const userService = require("./user.service");
          const client = await userService.getUserById(booking.userId);
          if (client && client.name) {
            userName = client.name.split(' ')[0]; // First name only
          }
        } catch (error) {
          logger.error("Error fetching client name for folder:", { error: error.message });
        }
      } else if (booking.guestName) {
        // Use guest name for folder naming
        userName = booking.guestName.split(' ')[0]; // First name only
      }

      // Get shoot type for folder naming (use actual shoot type, not serviceType which is "shoot-raw"/"shoot-edit")
      const folderShootType = (booking.shootType || booking.serviceType || "Photography")
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('_');

      // Create folder path using format: ShootType_ClientName_ShootID
      const file_path = `${folderShootType}_${userName}_${orderData.shoot_id}`;

      // Update order with folder path
      await Order.findByIdAndUpdate(
        order._id,
        {
          file_path: {
            status: false,
            dir_name: file_path
          }
        },
        { session }
      );

      logger.info(`Creating folder for order: ${file_path}`, {
        orderId: order._id,
        userName,
        shootType: folderShootType,
        folderPath: file_path
      });

      // Create folders in GCP (after transaction commits)
      // We need to do this outside the transaction since GCP operations are external
      setImmediate(async () => {
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

          logger.info(`Folders created successfully for order: ${order._id}`, {
            folderPath: file_path,
            orderId: order._id
          });
        } catch (folderError) {
          logger.error("Failed to create folders for order:", {
            orderId: order._id,
            folderPath: file_path,
            error: folderError.message,
          });
        }
      });
      // ============================================================

      // Update Airtable with order reference
      if (booking.airtableId) {
        setImmediate(async () => {
          try {
            await updateAirtableWithOrder(booking.airtableId, order._id);
          } catch (error) {
            logger.error("Failed to update Airtable with order reference:", {
              bookingId: booking._id,
              orderId: order._id,
              airtableId: booking.airtableId,
              error: error.message,
            });
          }
        });
      }

      // Send notifications for the new order to CPs (async, don't block the transaction)
      // Note: Client doesn't need notification - they just created the order themselves
      setImmediate(async () => {
        try {
          const notificationService = require('./notification.service');
          const { sendNotification } = require('./fcm.service');

          // Notify CPs if any are assigned (e.g., salesRepId)
          if (order.cp_ids && order.cp_ids.length > 0) {
            const cpNotificationTitle = "New Shoot Request";
            const cpNotificationContent = "You have received a new Shoot request. Feel free to review it and accept when you are ready";

            for (const cp of order.cp_ids) {
              const cpId = cp.id.toString();

              // Send FCM push notification to CP
              sendNotification(cpId, cpNotificationTitle, cpNotificationContent, {
                type: "newOrder",
                order_id: order._id.toString(),
                id: order._id.toString(),
                order_name: order.order_name,
              });

              // Create in-app notification for CP
              await notificationService.insertNotification({
                modelName: 'Order',
                modelId: order._id,
                cpIds: [cp.id],
                category: 'newOrder',
                message: cpNotificationContent,
                metadata: {
                  title: cpNotificationTitle,
                  type: 'newOrder',
                  order_id: order._id.toString(),
                  order_name: order.order_name,
                }
              });
            }

            logger.info(`Notifications sent to CPs for new order: ${order._id}`);
          }
        } catch (notificationError) {
          logger.error("Failed to send notifications for new order:", {
            orderId: order._id,
            error: notificationError.message,
          });
        }
      });

      logger.info(
        `Booking converted to order: ${booking._id} -> ${order._id}`,
        {
          bookingId: booking._id,
          orderId: order._id,
          userId: booking.userId || "guest",
          guestEmail: booking.guestEmail,
          totalAmount: booking.totalAmount,
          folderPath: file_path,
        }
      );

      return order;
    },
    {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
    }
  );
};

/**
 * Ensure booking has a confirmation number before syncing to Airtable
 * @param {Object} booking - Booking document
 * @returns {Promise<Object>} Booking with confirmation number
 */
const ensureConfirmationNumber = async (booking) => {
  if (!booking.confirmationNumber) {
    // If somehow the confirmation number is missing, trigger a save to generate it
    logger.warn(`Booking ${booking._id} missing confirmation number, generating now...`);

    // Set status to confirmed if not already to trigger generation
    if (booking.status !== "confirmed" && booking.status !== "paid") {
      booking.status = "confirmed";
    }

    await booking.save();

    // Verify it was generated
    if (!booking.confirmationNumber) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to generate confirmation number for booking"
      );
    }

    logger.info(`Generated confirmation number ${booking.confirmationNumber} for booking ${booking._id}`);
  }

  return booking;
};

/**
 * Create Airtable record for booking
 * @param {Object} booking - Booking document
 * @returns {Promise<Object>} Airtable record info
 */
const createAirtableRecord = async (booking) => {
  try {
    const { airtableService } = require("./");

    // CRITICAL: Ensure confirmation number exists before syncing
    await ensureConfirmationNumber(booking);

    const bookingData = {
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      serviceType: booking.serviceType,
      contentType: Array.isArray(booking.contentType)
        ? booking.contentType.join(", ")
        : booking.contentType,
      shootType: booking.shootType,
      editType: booking.editType,
      startDateTime: booking.startDateTime.toISOString(),
      durationHours: booking.durationHours,
      location: booking.location,
      description: booking.description,
    };

    const paymentData = {
      totalAmount: booking.totalAmount || booking.budget,
      basePrice: booking.basePrice,
      discount: booking.discount,
    };

    // Pass the booking's confirmation number to Airtable to maintain consistency
    const airtableRecord = await airtableService.createBookingRecord(
      bookingData,
      paymentData,
      booking.confirmationNumber // Use the booking's existing confirmation number
    );

    // Update booking with Airtable reference (confirmation number should already match)
    await Booking.findByIdAndUpdate(booking._id, {
      airtableId: airtableRecord.airtableId,
      // Don't overwrite confirmationNumber since we're using the booking's existing one
      "lastSyncAt.airtable": new Date(),
      "lastSyncError.airtable": null,
    });

    logger.info(`Booking synced to Airtable: ${booking._id}`, {
      bookingId: booking._id,
      airtableId: airtableRecord.airtableId,
      confirmationNumber: airtableRecord.confirmationNumber,
    });

    return airtableRecord;
  } catch (error) {
    logger.error("Airtable sync failed:", {
      bookingId: booking._id,
      error: error.message,
    });

    // Update booking with retry info
    await Booking.findByIdAndUpdate(booking._id, {
      "lastSyncError.airtable": error.message,
      "syncAttempts.airtable": { $inc: 1 },
    });

    throw error;
  }
};

/**
 * Update Airtable record with order reference
 * @param {string} airtableId - Airtable record ID
 * @param {string} orderId - MongoDB order ID
 * @returns {Promise<Object>} Updated Airtable record
 */
const updateAirtableWithOrder = async (airtableId, orderId) => {
  try {
    const { airtableService } = require("./");

    // Update status to "completed" instead of "order_created"
    // Valid Airtable status values are: paid, assigned, completed
    const updates = {};

    const record = await airtableService.updateBookingStatus(
      airtableId,
      "completed",
      updates
    );

    logger.info(`Airtable updated with order reference: ${airtableId}`, {
      airtableId,
      orderId,
    });

    return record;
  } catch (error) {
    logger.error("Airtable order update failed:", {
      airtableId,
      orderId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Get user bookings (authenticated or guest by email)
 * @param {string} userIdOrEmail - User ID or guest email
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Paginated bookings
 */
const getUserBookings = async (userIdOrEmail, options = {}) => {
  const filter = mongoose.Types.ObjectId.isValid(userIdOrEmail)
    ? { userId: userIdOrEmail }
    : { guestEmail: userIdOrEmail.toLowerCase() };

  const defaultOptions = {
    sortBy: "createdAt:desc",
    limit: 10,
    page: 1,
  };

  return queryBookings(filter, { ...defaultOptions, ...options });
};

/**
 * Retry failed external syncs
 * @param {string} service - Service to retry (airtable, email)
 * @returns {Promise<Object>} Retry results
 */
const retryFailedSyncs = async (service = "airtable") => {
  try {
    const bookingsNeedingRetry = await Booking.findNeedingRetry(service);

    const results = {
      total: bookingsNeedingRetry.length,
      successful: 0,
      failed: 0,
      errors: [],
    };

    for (const booking of bookingsNeedingRetry) {
      try {
        if (service === "airtable") {
          await createAirtableRecord(booking);
          results.successful++;
        }
        // Add other services as needed
      } catch (error) {
        results.failed++;
        results.errors.push({
          bookingId: booking._id,
          error: error.message,
        });
      }
    }

    logger.info(`Retry sync completed for ${service}:`, results);
    return results;
  } catch (error) {
    logger.error(`Retry sync failed for ${service}:`, error);
    throw error;
  }
};

/**
 * Process pending booking conversions
 * @returns {Promise<Object>} Processing results
 */
const processPendingConversions = async () => {
  try {
    const pendingBookings = await Booking.findPendingConversions();

    const results = {
      total: pendingBookings.length,
      successful: 0,
      failed: 0,
      errors: [],
    };

    for (const booking of pendingBookings) {
      try {
        await convertBookingToOrder(booking._id);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          bookingId: booking._id,
          error: error.message,
        });
      }
    }

    logger.info("Pending conversions processed:", results);
    return results;
  } catch (error) {
    logger.error("Processing pending conversions failed:", error);
    throw error;
  }
};

/**
 * Update booking payment status from Stripe webhook
 * @param {string} bookingId - Booking ID
 * @param {string} paymentStatus - New payment status
 * @param {Object} paymentData - Payment metadata
 * @returns {Promise<Booking>} Updated booking
 */
const updateBookingPayment = async (
  bookingId,
  paymentStatus,
  paymentData = {}
) => {
  try {
    const updateData = {
      paymentStatus,
      ...paymentData,
    };

    // If payment is successful, update status to paid
    if (paymentStatus === "paid") {
      updateData.status = "paid";
    }

    const booking = await updateBookingById(bookingId, updateData);

    logger.info(`Booking payment updated: ${bookingId}`, {
      bookingId,
      paymentStatus,
      newStatus: booking.status,
    });

    return booking;
  } catch (error) {
    logger.error("Booking payment update failed:", {
      bookingId,
      paymentStatus,
      error: error.message,
    });
    throw error;
  }
};

module.exports = {
  createBooking,
  queryBookings,
  getBookingById,
  updateBookingById,
  deleteBookingById,
  convertBookingToOrder,
  createAirtableRecord,
  updateAirtableWithOrder,
  getUserBookings,
  retryFailedSyncs,
  processPendingConversions,
  updateBookingPayment,
};
