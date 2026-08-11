const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const firebaseHttpAccessTokenSchema = mongoose.Schema(
  {
    project_key: {
      type: String,
      required: true,
      trim: true,
      default: 'default',
    },
    project_id: {
      type: String,
      required: true,
      trim: true,
    },
    access_token: {
      type: String,
      default: null,
    },
    expires_at: {
      type: Date,
      default: null,
    },
    refreshed_at: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

firebaseHttpAccessTokenSchema.plugin(toJSON);
firebaseHttpAccessTokenSchema.index({ project_key: 1 }, { unique: true });
firebaseHttpAccessTokenSchema.index({ project_key: 1, is_active: 1 });

const FirebaseHttpAccessToken = mongoose.model('FirebaseHttpAccessToken', firebaseHttpAccessTokenSchema);

module.exports = FirebaseHttpAccessToken;
