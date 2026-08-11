const axios = require('axios');
const jwt = require('jsonwebtoken');
const httpStatus = require('http-status');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { FirebaseHttpAccessToken } = require('../models');
const {
  GOOGLE_OAUTH_TOKEN_URL,
  DEFAULT_PROJECT_KEY,
  FCM_SCOPE,
  getFirebaseProjects,
} = require('../config/firebase-http');

const REFRESH_INTERVAL_MS = 58 * 60 * 1000;
const EXPIRY_SAFETY_WINDOW_MS = 60 * 1000;
let refreshTimer = null;

const isTokenUsable = (tokenRecord) => {
  if (!tokenRecord?.access_token || !tokenRecord?.expires_at) return false;
  return new Date(tokenRecord.expires_at).getTime() > Date.now() + EXPIRY_SAFETY_WINDOW_MS;
};

const requestGoogleAccessToken = async (project) => {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: project.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: nowInSeconds,
      exp: nowInSeconds + 3600,
    },
    project.privateKey,
    { algorithm: 'RS256' }
  );

  const response = await axios.post(
    GOOGLE_OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    }
  );

  return {
    accessToken: response.data?.access_token,
    expiresIn: response.data?.expires_in,
  };
};

const refreshFirebaseAccessToken = async (project) => {
  const tokenResponse = await requestGoogleAccessToken(project);

  if (!tokenResponse.accessToken) {
    throw new Error('Firebase OAuth token response was empty.');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(tokenResponse.expiresIn || 3600) * 1000);

  return FirebaseHttpAccessToken.findOneAndUpdate(
    { project_key: project.key },
    {
      $set: {
        project_key: project.key,
        project_id: project.projectId,
        access_token: tokenResponse.accessToken,
        expires_at: expiresAt,
        refreshed_at: now,
        is_active: true,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const getValidStoredAccessToken = async (projectKey = DEFAULT_PROJECT_KEY) => {
  const tokenRecord = await FirebaseHttpAccessToken.findOne({
    project_key: projectKey,
    is_active: true,
  });

  if (!isTokenUsable(tokenRecord)) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Firebase access token is missing or expired.');
  }

  return tokenRecord;
};

const startFirebaseAccessTokenRefreshScheduler = async () => {
  const refreshAllProjects = async () => {
    const projects = getFirebaseProjects();
    for (const project of projects) {
      try {
        await refreshFirebaseAccessToken(project);
        logger.info(`Firebase HTTP v1 access token refreshed for ${project.key}`);
      } catch (error) {
        logger.error(`Firebase HTTP v1 token refresh failed for ${project.key}: ${error.message}`);
      }
    }
  };

  try {
    await refreshAllProjects();
  } catch (error) {
    logger.error(`Firebase HTTP v1 startup token refresh failed: ${error.message}`);
  }

  if (refreshTimer) clearInterval(refreshTimer);

  refreshTimer = setInterval(async () => {
    try {
      await refreshAllProjects();
    } catch (error) {
      logger.error(`Firebase HTTP v1 scheduled token refresh failed: ${error.message}`);
    }
  }, REFRESH_INTERVAL_MS);

  if (refreshTimer.unref) refreshTimer.unref();
};

module.exports = {
  refreshFirebaseAccessToken,
  getValidStoredAccessToken,
  startFirebaseAccessTokenRefreshScheduler,
};
