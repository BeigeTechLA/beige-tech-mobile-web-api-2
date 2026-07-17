const axios = require('axios');
const httpStatus = require('http-status');
const { DEFAULT_PROJECT_KEY } = require('../config/firebase-http');
const { getValidStoredAccessToken } = require('./firebase-auth.helper');
const { buildFcmHttpV1Payload } = require('./notification-payload.helper');

const FCM_SEND_URL = (projectId) => `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
const PERMANENT_TOKEN_ERROR_CODES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT']);

const extractFirebaseErrorCode = (errorData = {}) => {
  const details = Array.isArray(errorData.error?.details) ? errorData.error.details : [];
  const fcmError = details.find((item) => item.errorCode);
  return fcmError?.errorCode || errorData.error?.status || errorData.error?.code || null;
};

const isPermanentTokenError = (errorData = {}) => {
  const code = extractFirebaseErrorCode(errorData);
  const message = String(errorData.error?.message || '').toLowerCase();

  if (PERMANENT_TOKEN_ERROR_CODES.has(code)) return true;
  if (message.includes('registration-token-not-registered')) return true;
  return code === 'INVALID_ARGUMENT' && message.includes('token');
};

const sendFcmHttpV1Message = async ({ token, title, body, data = {}, projectKey = DEFAULT_PROJECT_KEY }) => {
  const tokenRecord = await getValidStoredAccessToken(projectKey);
  const payload = buildFcmHttpV1Payload({ token, title, body, data });

  try {
    const response = await axios.post(FCM_SEND_URL(tokenRecord.project_id), payload, {
      headers: {
        Authorization: `Bearer ${tokenRecord.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    return {
      success: true,
      name: response.data?.name || null,
    };
  } catch (error) {
    const errorData = error.response?.data || {};
    const sendError = new Error(errorData.error?.message || 'Firebase HTTP v1 request failed.');
    sendError.httpCode = error.response?.status || httpStatus.INTERNAL_SERVER_ERROR;
    sendError.firebaseErrorCode = extractFirebaseErrorCode(errorData);
    sendError.isPermanentTokenError = isPermanentTokenError(errorData);
    throw sendError;
  }
};

module.exports = {
  sendFcmHttpV1Message,
};
