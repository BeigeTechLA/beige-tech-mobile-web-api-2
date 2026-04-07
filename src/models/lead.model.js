const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const leadSchema = new mongoose.Schema(
  {
    // Optional reference to an order if this lead was created from an order
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
      index: true,
    },
    
    // Required reference to the customer
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    
    // Lead status
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "proposal_sent", "negotiation", "closed_won", "closed_lost"],
      default: "new",
      index: true,
    },
    
    // Lead source
    source: {
      type: String,
      enum: ["website", "referral", "social_media", "email", "phone", "in_person", "other"],
      default: "website",
    },
    
    // Lead type
    lead_type: {
      type: String,
      enum: ["individual", "business", "agency", "other"],
      default: "individual",
    },
    
    // Lead score based on engagement and fit
    score: {
      type: Number,
      min: 0,
      max: 100000000,
      default: 0,
    },
    
    // Tags for categorization
    tags: [{
      type: String,
      trim: true,
    }],
    
    // Assigned employees
    assigned_employees: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    
    // Custom fields
    custom_fields: {
      type: Map,
      of: String,
      default: {},
    },
    
    // Lead logs to track order interactions
    leadLog: [{
      order_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true
      },
      tracking_point: {
        type: String,
        enum: ["order_created", "Payment_page","pament_failed", "order_completed", "order_cancelled", "other"],
        default: "order_created"
      },
      value_amount: {
        type: Number,
        default: 0
      },
      currency: {
        type: String,
        default: "USD"
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      notes: {
        type: String,
        trim: true
      }
    }],
    
    // Last contact date
    last_contacted: {
      type: Date,
      required: false,
    },
    
    // Next follow-up date
    next_follow_up: {
      type: Date,
      required: false,
    },
    
    // Expected close date
    expected_close_date: {
      type: Date,
      required: false,
    },
    
    // Lead value in the company's currency
    value: {
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      currency: {
        type: String,
        default: "USD",
      },
    },
    
    // Lead probability (0-100%)
    probability: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    
    // Lost reason (if applicable)
    lost_reason: {
      type: String,
      required: false,
      trim: true,
    },
    
    // Lead description/notes
    description: {
      type: String,
      required: false,
      trim: true,
    },
    
    // Lead conversion details
    converted: {
      is_converted: {
        type: Boolean,
        default: false,
      },
      converted_at: {
        type: Date,
        required: false,
      },
      converted_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false,
      },
    },
    
    // Lead owner (primary contact person)
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    
    // Lead contact information
    contact: {
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
      position: {
        type: String,
        required: false,
        trim: true,
      },
    },
    
    // Company information (for business leads)
    company: {
      name: {
        type: String,
        required: false,
        trim: true,
      },
      website: {
        type: String,
        required: false,
        trim: true,
      },
      size: {
        type: String,
        enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001+", null],
        required: false,
      },
      industry: {
        type: String,
        required: false,
        trim: true,
      },
    },
    
    // Address information
    address: {
      street: {
        type: String,
        required: false,
        trim: true,
      },
      city: {
        type: String,
        required: false,
        trim: true,
      },
      state: {
        type: String,
        required: false,
        trim: true,
      },
      postal_code: {
        type: String,
        required: false,
        trim: true,
      },
      country: {
        type: String,
        required: false,
        trim: true,
      },
    },
    
    // Lead status history
    status_history: [
      {
        status: {
          type: String,
          required: true,
        },
        changed_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        reason: {
          type: String,
          required: false,
          trim: true,
        },
        created_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    
    // Lead custom attributes
    attributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // Lead deletion flag (soft delete)
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    
    // Lead archive flag
    is_archived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add virtual for tasks
leadSchema.virtual('tasks', {
  ref: 'Task',
  localField: '_id',
  foreignField: 'leadId',
});

// Add virtual for notes
leadSchema.virtual('notes', {
  ref: 'Note',
  localField: '_id',
  foreignField: 'leadId',
});

// Add virtual for quotations
leadSchema.virtual('quotations', {
  ref: 'Quotation',
  localField: '_id',
  foreignField: 'leadId',
});

// Add plugin that converts mongoose to json
leadSchema.plugin(toJSON);
leadSchema.plugin(paginate);

// Indexes for better query performance
leadSchema.index({ 'contact.email': 1 });
leadSchema.index({ 'contact.phone': 1 });
leadSchema.index({ 'company.name': 1 });
leadSchema.index({ 'address.city': 1 });
leadSchema.index({ 'address.country': 1 });
leadSchema.index({ 'converted.is_converted': 1 });
leadSchema.index({ 'converted.converted_at': 1 });
leadSchema.index({ 'source': 1, 'status': 1 });
leadSchema.index({ 'assigned_employees': 1, 'status': 1 });

/**
 * @typedef Lead
 */
const Lead = mongoose.model("Lead", leadSchema);

module.exports = Lead;
