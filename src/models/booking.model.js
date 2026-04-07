const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

/**
 * Booking Schema for authenticated checkout system
 * Supports both guest and authenticated users with dual storage in MongoDB and Airtable
 */
const bookingSchema = new mongoose.Schema(
  {
    // User reference (optional for guests)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },

    // Sales rep reference (required - CP who creates/handles the booking)
    salesRepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },

    // Guest information (required for all bookings)
    guestName: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100,
    },
    guestEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    guestPhone: {
      type: String,
      required: true,
      trim: true,
    },

    // Service details
    serviceType: {
      type: String,
      required: true,
      enum: ["videography", "photography", "editing_only", "all", "shoot-edit", "shoot-raw"],
    },
    contentType: {
      type: [String],
      required: true,
      enum: [
        "photo",
        "video",
        "edit",
        "all",
        "videography",
        "photography",
        "both",
      ],
    },
    shootType: {
      type: String,
      required: false,
      trim: true,
    },
    editType: {
      type: String,
      required: false,
      trim: true,
    },

    // Schedule information
    startDateTime: {
      type: Date,
      required: true,
      index: true,
    },
    endDateTime: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return value > this.startDateTime;
        },
        message: "End date time must be after start date time",
      },
    },
    durationHours: {
      type: Number,
      required: true,
      min: 0.5,
    },

    // Location details
    location: {
      type: String,
      required: true,
      trim: true,
    },
    needStudio: {
      type: Boolean,
      required: false,
      default: false,
    },

    // Pricing information
    budget: {
      type: Number,
      required: true,
      min: 0,
    },
    basePrice: {
      type: Number,
      required: false,
      min: 0,
    },
    discount: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: false,
      min: 0,
    },
    // Manual price override (optional - only set by sales rep)
    manualPrice: {
      type: Number,
      required: false,
      min: 0,
    },

    // Additional details
    description: {
      type: String,
      required: false,
      maxLength: 1000,
    },
    references: {
      type: String,
      required: false,
      maxLength: 500,
    },

    // Status tracking
    status: {
      type: String,
      required: true,
      default: "pending",
      enum: ["pending", "confirmed", "paid", "converted", "cancelled"],
      index: true,
    },
    paymentStatus: {
      type: String,
      required: true,
      default: "pending",
      enum: ["pending", "processing", "paid", "failed", "refunded"],
      index: true,
    },

    // External system references
    stripeSessionId: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // Allows multiple null values
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    airtableId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      index: true,
    },
    confirmationNumber: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },

    // Metadata for tracking and analytics
    sourceChannel: {
      type: String,
      required: false,
      enum: ["web", "mobile", "admin", "api"],
      default: "web",
    },
    ipAddress: {
      type: String,
      required: false,
    },
    userAgent: {
      type: String,
      required: false,
    },

    // Retry and error handling
    syncAttempts: {
      airtable: {
        type: Number,
        default: 0,
        max: 5,
      },
      email: {
        type: Number,
        default: 0,
        max: 3,
      },
    },
    lastSyncError: {
      airtable: {
        type: String,
        required: false,
      },
      email: {
        type: String,
        required: false,
      },
    },
    lastSyncAt: {
      airtable: {
        type: Date,
        required: false,
      },
      email: {
        type: Date,
        required: false,
      },
    },

    // Conversion tracking
    convertedAt: {
      type: Date,
      required: false,
      index: true,
    },
    conversionNote: {
      type: String,
      required: false,
      maxLength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
bookingSchema.index({ guestEmail: 1, createdAt: -1 });
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ salesRepId: 1, createdAt: -1 });
bookingSchema.index({ status: 1, paymentStatus: 1 });
bookingSchema.index({ startDateTime: 1, status: 1 });
bookingSchema.index({ createdAt: -1 });

// Virtual for checking if booking is for authenticated user
bookingSchema.virtual("isAuthenticated").get(function () {
  return !!this.userId;
});

// Virtual for checking if booking is guest-only
bookingSchema.virtual("isGuest").get(function () {
  return !this.userId;
});

// Virtual for getting booking age in days
bookingSchema.virtual("ageInDays").get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

/**
 * Generate a unique confirmation number with database validation
 * @param {Date} date - Date for the confirmation number
 * @param {Number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<string>} Unique confirmation number
 */
async function generateUniqueConfirmationNumber(date, maxRetries = 10) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const datePrefix = `BRG-${year}${month}${day}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Generate a more robust random suffix using crypto-like randomness
    // Combine timestamp + random for better uniqueness
    const timestamp = Date.now() % 10000; // Last 4 digits of timestamp
    const random = Math.floor(Math.random() * 10000); // 0-9999
    const combined = (timestamp + random) % 10000; // Ensure 4 digits max
    const suffix = combined.toString().padStart(4, "0");

    const confirmationNumber = `${datePrefix}-${suffix}`;

    // Check if this confirmation number already exists
    const existing = await mongoose.model("Booking").findOne({
      confirmationNumber
    }).lean();

    if (!existing) {
      return confirmationNumber;
    }

    // If collision detected, add exponential backoff before retry
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 10));
    }
  }

  // Fallback: Use timestamp-based suffix if all retries fail
  const fallbackSuffix = Date.now().toString().slice(-6);
  return `${datePrefix}-${fallbackSuffix}`;
}

// Pre-save middleware for validation and computed fields
bookingSchema.pre("save", async function (next) {
  // Calculate total amount if base price and discount are provided
  if (this.basePrice !== undefined && this.discount !== undefined) {
    this.totalAmount = Math.max(0, this.basePrice - this.discount);
  }

  // Auto-generate confirmation number ONLY for new documents
  // CRITICAL: Only generate on new documents OR if explicitly cleared and status requires it
  // Format: BRG-YYYYMMDD-XXXX (4-digit suffix for better uniqueness)
  const shouldGenerateConfirmation =
    !this.confirmationNumber &&
    (this.status === "confirmed" || this.status === "paid") &&
    (this.isNew || this.isModified('status')); // Only on new docs or status change

  if (shouldGenerateConfirmation) {
    try {
      const now = new Date();
      this.confirmationNumber = await generateUniqueConfirmationNumber(now);
      console.log(`Generated confirmation number: ${this.confirmationNumber} for booking ${this._id || 'new'}`);
    } catch (error) {
      // If generation fails, let it proceed without confirmation number
      // It will be generated on next save attempt
      console.error("Failed to generate confirmation number:", error.message);
      // Don't throw - let the transaction continue and retry later
    }
  }

  next();
});

// Instance methods
bookingSchema.methods = {
  /**
   * Check if booking can be cancelled
   * @returns {boolean}
   */
  canBeCancelled() {
    const now = new Date();
    const bookingDate = new Date(this.startDateTime);
    const hoursUntilBooking = (bookingDate - now) / (1000 * 60 * 60);

    return (
      this.status !== "cancelled" &&
      this.status !== "converted" &&
      hoursUntilBooking > 24
    ); // 24 hour cancellation policy
  },

  /**
   * Check if booking is eligible for conversion to order
   * @returns {boolean}
   */
  canBeConverted() {
    return (
      this.status === "paid" && this.paymentStatus === "paid" && !this.orderId
    );
  },

  /**
   * Get booking summary for emails/notifications
   * @returns {Object}
   */
  getSummary() {
    return {
      id: this._id,
      confirmationNumber: this.confirmationNumber,
      guestName: this.guestName,
      guestEmail: this.guestEmail,
      serviceType: this.serviceType,
      contentType: this.contentType,
      startDateTime: this.startDateTime,
      durationHours: this.durationHours,
      location: this.location,
      totalAmount: this.totalAmount,
      status: this.status,
      paymentStatus: this.paymentStatus,
      salesRepId: this.salesRepId,
      isAuthenticated: this.isAuthenticated,
      createdAt: this.createdAt,
    };
  },

  /**
   * Mark booking as synced with external service
   * @param {string} service - The external service (airtable, email)
   * @param {boolean} success - Whether sync was successful
   * @param {string} error - Error message if sync failed
   */
  markSynced(service, success = true, error = null) {
    if (!this.syncAttempts[service]) this.syncAttempts[service] = 0;

    this.syncAttempts[service]++;
    this.lastSyncAt[service] = new Date();

    if (success) {
      this.lastSyncError[service] = null;
    } else {
      this.lastSyncError[service] = error;
    }
  },
};

// Static methods
bookingSchema.statics = {
  /**
   * Find bookings by user (authenticated or guest email)
   * @param {string} userIdOrEmail - User ID or guest email
   * @returns {Promise<Array>} Array of bookings
   */
  async findByUser(userIdOrEmail) {
    const query = mongoose.Types.ObjectId.isValid(userIdOrEmail)
      ? { userId: userIdOrEmail }
      : { guestEmail: userIdOrEmail.toLowerCase() };

    return this.find(query).sort({ createdAt: -1 });
  },

  /**
   * Find pending conversions (paid bookings without orders)
   * @returns {Promise<Array>} Array of bookings ready for conversion
   */
  async findPendingConversions() {
    return this.find({
      status: "paid",
      paymentStatus: "paid",
      orderId: { $exists: false },
    }).sort({ createdAt: 1 });
  },

  /**
   * Find bookings needing retry for external sync
   * @param {string} service - The external service (airtable, email)
   * @returns {Promise<Array>} Array of bookings needing retry
   */
  async findNeedingRetry(service) {
    return this.find({
      $and: [
        {
          [`syncAttempts.${service}`]: { $lt: service === "airtable" ? 5 : 3 },
        },
        { [`lastSyncError.${service}`]: { $ne: null } },
        { status: { $ne: "cancelled" } },
      ],
    }).sort({ createdAt: 1 });
  },

  /**
   * Get booking statistics
   * @param {Object} filter - Filter criteria
   * @returns {Promise<Object>} Booking statistics
   */
  async getStats(filter = {}) {
    const pipeline = [
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          paid: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
          },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          converted: {
            $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          totalRevenue: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalAmount", 0],
            },
          },
          guestBookings: {
            $sum: { $cond: [{ $eq: ["$userId", null] }, 1, 0] },
          },
          authenticatedBookings: {
            $sum: { $cond: [{ $ne: ["$userId", null] }, 1, 0] },
          },
        },
      },
    ];

    const [stats] = await this.aggregate(pipeline);
    return (
      stats || {
        total: 0,
        paid: 0,
        pending: 0,
        converted: 0,
        cancelled: 0,
        totalRevenue: 0,
        guestBookings: 0,
        authenticatedBookings: 0,
      }
    );
  },
};

// Add plugins
bookingSchema.plugin(toJSON);
bookingSchema.plugin(paginate);

/**
 * @typedef Booking
 */
const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
