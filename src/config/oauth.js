const config = require('./config');

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';

const oauthConfig = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${backendUrl}/v1/auth/google/callback`,
    scope: ['profile', 'email']
  },
  facebook: {
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `${backendUrl}/v1/auth/facebook/callback`,
    profileFields: ['id', 'emails', 'name', 'displayName', 'photos']
  }
};

module.exports = oauthConfig;
