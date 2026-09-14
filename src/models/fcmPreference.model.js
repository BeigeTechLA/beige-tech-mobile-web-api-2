const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const preferenceSchema = mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      trim: true,
    },
    session_id: {
      type: String,
      required: true,
      trim: true,
    },
    notification_preferences: {
      push_enabled: {
        type: Boolean,
        default: true,
      },
      topics: {
        shoots: {
          type: Boolean,
          default: true,
        },
        messages: {
          type: Boolean,
          default: true,
        },
        meetings: {
          type: Boolean,
          default: true,
        },
        files: {
          type: Boolean,
          default: true,
        },
      },
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    last_used_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

preferenceSchema.plugin(toJSON);

preferenceSchema.index({ user_id: 1, session_id: 1 }, { unique: true });
preferenceSchema.index({ user_id: 1, is_active: 1 });

const FcmPreference = mongoose.model('FcmPreference', preferenceSchema);

module.exports = FcmPreference;
