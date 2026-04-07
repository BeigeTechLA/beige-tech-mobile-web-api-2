const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

// Define the Order schema
const orderSchema = new mongoose.Schema(
  {
    // Client ID associated with the order (optional for guest bookings)
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Changed to false to support guest bookings
    },

    // Content provider ID (optional)
    cp_ids: [
      {
        id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        decision: {
          type: String,
          default: "pending",
          enum: ["accepted", "booked", "pending", "cancelled"],
        },
        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // requested_cps

    // Chat room ID for the order (optional)
    chat_room_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "ChatRoom",
      default: null,
      required: false,
    },

    shoot_datetimes: [
      {
        start_date_time: {
          type: Date,
          required: true,
        },
        end_date_time: {
          type: Date,
          required: true,
        },
        duration: {
          type: Number,
          required: true,
        },
        date_status: {
          type: String,
          enum: ["confirmed", "rejected", "changeRequested", "pending"],
        },
      },
    ],
    order_status: {
      type: String,
      default: "pending",
      enum: [
        "pending",
        "pre_production",
        "production",
        "post_production",
        "revision",
        "completed",
        "cancelled",
        "in_dispute",
      ],
    },
    content_type: {
      type: [String],
      enum: [
        "photo",
        "video",
        "edit",
        "all",
        "videography",
        "photography",
        "editing_only",
        "both",
      ],
      required: false,
    },
    service_type: {
      type: String,
      // enum: ["videography", "photography", "editing_only"],
      required: false,
    },

    content_vertical: {
      type: String,
      required: false,
    },
    shoot_type: {
      type: String,
      required: false,
    },
    // vst is tags related to each vertical specilisation of the content. Like indian wedding, african wedding, etc.
    vst: {
      type: [String],
      required: false,
    },
    location: {
      type: String,
      required: false,
    },

    geo_location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    budget: {
      max: {
        type: Number,
        required: false,
      },
      min: {
        type: Number,
        default: 1000,
        required: false,
      },
      suggested: {
        type: Number,
        required: false,
      },
    },
    description: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
    },
    pre_production_notes: {
      type: String,
      required: false,
    },
    shoot_duration: {
      type: Number,
      required: false,
    },
    // Unique 3-digit shoot ID for display (e.g., "123")
    shoot_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Order/shoot display name: ClientName_ShootID (e.g., "Lana_Guzman_123")
    order_name: {
      type: String,
      required: false,
    },
    references: {
      type: String,
      required: false,
    },
    meeting_date_times: [
      {
        type: mongoose.SchemaTypes.ObjectId,
        ref: "Meeting",
      },
    ],
    shoot_cost: {
      type: Number,
      required: false,
    },
    fileUrls: {
      type: [String],
      default: [],
    },
    platformLinks: {
      type: [
        {
          platform: {
            type: String,
            enum: [
              "YouTube",
              "Vimeo",
              "Instagram",
              "Google Drive",
              "Pinterest",
              "Other",
            ],
            required: true,
          },
          url: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
    external_links: {
      type: [
        {
          title: {
            type: String,
            required: false,
          },
          url: {
            type: String,
            required: true,
          },
          notes: {
            type: String,
            required: false,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    addOns_cost: {
      type: Number,
      required: false,
    },
    addOn_note: {
      type: String,
      required: false,
    },
    addOns: {
      type: [
        {
          _id: {
            type: mongoose.SchemaTypes.ObjectId,
            ref: "AddOns",
            required: false,
          },
          title: {
            type: String,
            required: false,
          },
          rate: {
            type: Number,
            required: false,
          },
          category: {
            type: String,
            required: false,
          },
          ExtendRateType: {
            type: String,
            enum: ["hourly", "day", "fixed"],
            required: false,
          },
          ExtendRate: {
            type: Number,
            required: false,
          },
          status: {
            type: Number,
            required: false,
          },
          quantity: {
            type: Number,
            required: false,
          },
          info: {
            type: String,
            required: false,
          },
          hours: {
            type: Number,
            required: false,
          },
        },
      ],
      required: false,
    },

    billing_info: {
      address: {
        type: String,
        required: false,
      },
      city: {
        type: String,
        required: false,
      },
      state: {
        type: String,
        required: false,
      },
      country: {
        type: String,
        required: false,
      },
      zip_code: {
        type: String,
        required: false,
      },
    },

    payment: {
      payment_type: {
        type: String,
        default: "full",
        enum: ["partial", "full"],
        required: false,
      },
      payment_status: {
        type: String,
        default: "pending",
        enum: ["pending", "partially_paid", "paid"],
        required: false,
      },
      amount_paid: {
        type: Number,
        required: false,
        default: 0,
      },
      amount_remaining: {
        type: Number,
        default: function () {
          return this.budget.suggested;
        },
        required: false,
      },
      payment_ids: [
        {
          type: mongoose.SchemaTypes.ObjectId,
          ref: "Payment",
          required: false,
        },
      ],
    },
    file_path: {
      status: {
        type: Boolean,
        default: false,
      },
      last_upload: {
        type: Date,
        required: false,
      },
      dir_name: {
        type: String,
        required: false,
      },
    },
    review_status: {
      type: Boolean,
      default: false,
    },
    quotationLog: [
      {
        quotationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Quotation",
          required: true,
        },
        discount_type: {
          type: String,
          enum: ["flat", "percentage", "none"],
          required: true,
        },
        discount_value: {
          type: Number,
          required: true,
          default: 0,
        },
        before_shoot_cost: {
          type: Number,
          required: true,
        },
        after_shoot_cost: {
          type: Number,
          required: true,
        },
        created_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ============================================================================
    // BOOKING INTEGRATION FIELDS
    // ============================================================================

    // Reference to the booking that created this order
    booking_ref: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: false,
      index: true,
    },

    // Guest information for non-authenticated bookings
    guest_info: {
      name: {
        type: String,
        required: false,
        trim: true,
      },
      email: {
        type: String,
        required: false,
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
        required: false,
        trim: true,
      },
    },

    // Additional booking-related metadata
    booking_source: {
      type: String,
      enum: ["direct", "booking_conversion", "manual"],
      default: "direct",
      required: false,
    },

    // Track conversion details if created from booking
    conversion_details: {
      converted_at: {
        type: Date,
        required: false,
      },
      converted_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false,
      },
      original_booking_status: {
        type: String,
        required: false,
      },
      conversion_note: {
        type: String,
        required: false,
        maxLength: 500,
      },
    },

    // Assigned creative information (for Email #2 feature)
    assignedCreative: {
      name: {
        type: String,
        required: false,
        trim: true,
      },
      phone: {
        type: String,
        required: false,
        trim: true,
      },
      email: {
        type: String,
        required: false,
        trim: true,
        lowercase: true,
      },
      socialHandles: {
        type: String,
        required: false,
        trim: true,
      },
      assignedAt: {
        type: Date,
        required: false,
      },
      emailSentAt: {
        type: Date,
        required: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
orderSchema.plugin(toJSON);
orderSchema.plugin(paginate);
orderSchema.index({ geo_location: "2dsphere" });
orderSchema.index({ client_id: 1 });
orderSchema.index({ "cp_ids.id": 1 });
orderSchema.index({ order_status: 1 });
orderSchema.index({ createdAt: -1 });

// Define the Order model using the schema
const Order = mongoose.model("Order", orderSchema);

// Export the Order model
module.exports = Order;
