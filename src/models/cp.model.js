const mongoose = require("mongoose");
const { toJSON, paginate, paginateCp } = require("./plugins");

const cpSchema = new mongoose.Schema(
  {
    created_at: {
      type: Date,
      default: Date.now,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    city: {
      type: String,
      required: false,
    },
    neighborhood: {
      type: String,
      required: false,
    },
    zip_code: {
      type: String,
      required: false,
    },
    content_type: {
      type: [String],
      required: false,
    },
    content_verticals: {
      type: [String],
      required: false,
    },
    // Tags: Indian Wedding etc
    vst: {
      type: [String],
      required: false,
    },
    shoot_availability: {
      type: [String],
      required: false,
    },
    notification: {
      type: [String],
      required: false,
    },
    successful_beige_shoots: {
      type: Number,
      default: 0,
      required: false,
    },
    rate: {
      type: String,
      default: 0,
      required: false,
    },
    photographyRate: {
      type: String,
      required: false,
    },
    videographyRate: {
      type: String,
      required: false,
    },
    combinedRate: {
      type: String,
      required: false,
    },
    rateFlexibility: {
      type: Boolean,
      default: true,
      required: false,
    },
    trust_score: {
      type: Number,
      default: 0,
      required: false,
    },
    average_rating: {
      type: Number,
      default: 0,
      required: false,
    },
    avg_response_time: {
      type: Number,
      default: 0,
      required: false,
    },
    last_beige_shoot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shoot",
    },
    equipment: {
      type: [String],
      required: false,
    },
    equipment_specific: {
      type: [String],
      required: false,
    },
    portfolio: {
      type: [String],
      required: false,
    },
    total_earnings: {
      type: Number,
      default: 0,
      required: false,
    },
    timezone: {
      type: String,
      required: false,
    },
    backup_footage: {
      type: [String],
      required: false,
    },
    own_transportation_method: {
      type: Boolean,
      required: false,
    },
    travel_to_distant_shoots: {
      type: Boolean,
      default: false,
      required: false,
    },
    experience_with_post_production_edit: {
      type: String,
      default: "",
      required: false,
    },
    customer_service_skills_experience: {
      type: Boolean,
      default: false,
      required: false,
    },
    portfolioFileUploaded: {
      type: Boolean,
      default: false,
      required: false,
    },
    team_player: {
      type: Boolean,
      default: false,
      required: false,
    },
    reference: {
      type: String,
      required: false,
    },
    avg_response_time_to_new_shoot_inquiry: {
      type: Number,
      default: 0,
      required: false,
    },
    num_declined_shoots: {
      type: Number,
      default: 0,
      required: false,
    },
    num_accepted_shoots: {
      type: Number,
      default: 0,
      required: false,
    },
    num_no_shows: {
      type: Number,
      default: 0,
      required: false,
    },
    review_status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      required: true,
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
    // new model item
    date_of_birth: {
      type: Date,
      default: "",
      required: false,
    },
    contact_number: {
      type: String || Number,
      required: false,
    },
    initiative: {
      type: String,
      default: "",
      required: false,
    },
    inWorkPressure: {
      type: String,
      default: "",
      required: false,
    },
    motivates: {
      type: String,
      default: "",
      required: false,
    },
    handle_co_worker_conflicts: {
      type: String,
      default: "",
      required: false,
    },
    prev_contribution: {
      type: String,
      default: "",
      required: false,
    },
    long_term_goals: {
      type: String,
      default: "",
      required: false,
    },
    professional_strength: {
      type: String,
      default: "",
      required: false,
    },
    when_made_mistake: {
      type: String,
      default: "",
      required: false,
    },
    additional_info: {
      type: String,
      default: "",
      required: false,
    },
    totalEarnings: {
      type: Number,
      default: 0,
      required: false,
    },
    currentBalance: {
      type: Number,
      default: 0,
      required: false,
    },
    rates: {
      acceptanceRate: {
        type: Number,
        default: 0,
        required: false,
      },
      cancellationRate: {
        type: Number,
        default: 0,
        required: false,
      },
    },
    tier: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum"],
      default: "bronze",
      required: false,
    },
    last_active_at: {
      type: Date,
      default: Date.now,
      required: false,
    },
    photographyRate: {
      type: String,
      default: "0",
      required: false,
    },
    videographyRate: {
      type: String,
      default: "0",
      required: false,
    },
    combinedRate: {
      type: String,
      default: "0",
      required: false,
    },
  },
  { timestamps: true }
);

// add plugin that converts mongoose to json
cpSchema.plugin(toJSON);
cpSchema.plugin(paginateCp);
cpSchema.plugin(paginate);
cpSchema.index({ geo_location: "2dsphere" });
cpSchema.index({ userId: 1 });

/**
 * @typedef CP
 */
const CP = mongoose.model("CP", cpSchema);

module.exports = CP;
