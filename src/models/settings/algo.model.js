const mongoose = require("mongoose");
const { toJSON } = require("../plugins");

/**
 * AlgoSetting Schema
 *
 * Defines the schema for the AlgoSetting collection in MongoDB.
 */
const algoSettingSchema = mongoose.Schema({
  search: {
    content_type: {
      weight: {
        type: Number,
        default: 4,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    content_vertical: {
      weight: {
        type: Number,
        default: 3,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    vst: {
      weight: {
        type: Number,
        default: 3,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    average_rating: {
      weight: {
        type: Number,
        default: 3,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    avg_response_time: {
      weight: {
        type: Number,
        default: 3,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    successful_beige_shoots: {
      weight: {
        type: Number,
        default: 2,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    team_player: {
      weight: {
        type: Number,
        default: 1,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    // New
    customer_service_experience: {
      weight: {
        type: Number,
        default: 2,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    equipment: {
      weight: {
        type: Number,
        default: 4,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    equipment_specific: {
      weight: {
        type: Number,
        default: 3,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    city: {
      weight: {
        type: Number,
        default: 3,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    portfolio: {
      weight: {
        type: Number,
        default: 3,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    declined_shoots: {
      weight: {
        type: Number,
        default: 2,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    accepted_shoots: {
      weight: {
        type: Number,
        default: 2,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    total_earnings: {
      weight: {
        type: Number,
        default: 1,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    backup_footage: {
      weight: {
        type: Number,
        default: 1,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    travel_to_distant_shoots: {
      weight: {
        type: Number,
        default: 1,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    experience_post_production: {
      weight: {
        type: Number,
        default: 1,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
    no_shows: {
      weight: {
        type: Number,
        default: 4,
        required: true,
      },
      score: {
        type: Number,
        default: 0,
        required: true,
      },
    },
  },
});


// Apply the 'toJSON' plugin to the schema for serialization

algoSettingSchema.plugin(toJSON);

/**
 * AlgoSetting Model
 *
 * Represents the Mongoose model for the AlgoSetting collection.
 */
const AlgoSetting = mongoose.model("AlgoSetting", algoSettingSchema);

module.exports = AlgoSetting;
