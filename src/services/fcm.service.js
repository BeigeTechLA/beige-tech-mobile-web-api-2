/**
 * FCM Service
 * This module handles sending notifications via Firebase Cloud Messaging (FCM) to users.
 */

const logger = require("../config/logger");
const { FcmToken } = require("../models");
const { sendFcmHttpV1Message } = require("../helpers/firebase-http.helper");
const ApiError = require("../utils/ApiError");
const httpStatus = require("http-status");
// Removed to fix circular dependency
// const { createNotificationFromFcm } = require("./notification.service");

/**
 * Save FCM Token
 * Saves a user's FCM registration token in the database.
 *
 * @param {string} userId - The ID of the user for whom to save the FCM token.
 * @param {string} registrationToken - The FCM registration token to be saved.
 * @returns {Promise<boolean>} A promise that resolves to true if the token was saved successfully, or false otherwise.
 */
const normalizeString = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
};

const normalizeDeviceType = (value) => {
  const deviceType = normalizeString(value)?.toLowerCase();
  return ['android', 'ios', 'web'].includes(deviceType) ? deviceType : 'android';
};

const NOTIFICATION_TOPICS = new Set([
  'shoots',
  'payments',
  'messages',
  'meetings',
  'proposals',
  'files',
  'system',
]);

const normalizeTopic = (value) => {
  const topic = normalizeString(value)?.toLowerCase();
  return NOTIFICATION_TOPICS.has(topic) ? topic : 'system';
};

const normalizeNotificationPreferences = (preferences = {}) => {
  const sourceTopics = preferences.topics || preferences.categories || {};
  const normalizedTopics = {};

  for (const topic of NOTIFICATION_TOPICS) {
    if (typeof sourceTopics[topic] === 'boolean') {
      normalizedTopics[topic] = sourceTopics[topic];
    }
  }

  const normalized = {};

  if (typeof preferences.push_enabled === 'boolean') {
    normalized.push_enabled = preferences.push_enabled;
  }

  if (Object.keys(normalizedTopics).length) {
    normalized.topics = normalizedTopics;
  }

  return normalized;
};

const isPushAllowedForToken = (tokenRecord, topic) => {
  const preferences = tokenRecord.notification_preferences || {};
  if (preferences.push_enabled === false) return false;

  const topics = preferences.topics || {};
  if (topics[topic] === false) return false;

  return true;
};

const saveFCMToken = async (userId, registrationToken, options = {}) => {
  try {
    const fcmToken = normalizeString(registrationToken || options.fcm_token);
    const sessionId = normalizeString(options.session_id);
    const notificationPreferences = normalizeNotificationPreferences(options.notification_preferences || {});

    if (!userId || !fcmToken) {
      throw new ApiError(httpStatus.BAD_REQUEST, "userId and registrationToken are required");
    }

    const payload = {
      user_id: userId,
      fcm_token: fcmToken,
      session_id: sessionId,
      device_type: normalizeDeviceType(options.device_type),
      app_user_type: normalizeString(options.app_user_type),
      is_active: true,
      last_used_at: new Date(),
    };

    if (Object.keys(notificationPreferences).length) {
      payload.notification_preferences = notificationPreferences;
    }

    const tokensRecord = await FcmToken.findOneAndUpdate(
      sessionId ? { user_id: userId, session_id: sessionId } : { fcm_token: fcmToken },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    logger.info(`FCM token saved for user ${userId}`);
    return tokensRecord;
  } catch (error) {
    logger.error("Error saving FCM token:", error);
    throw error;
  }
};

const removeFCMToken = async (userId, registrationToken, options = {}) => {
  try {
    const fcmToken = normalizeString(registrationToken);
    const sessionId = normalizeString(options.session_id);

    if (!userId || (!fcmToken && !sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "userId and registrationToken or session_id are required");
    }

    await FcmToken.updateOne(
      sessionId
        ? { user_id: userId, session_id: sessionId }
        : { user_id: userId, fcm_token: fcmToken },
      {
        $set: {
          is_active: false,
          last_used_at: new Date(),
        },
      }
    );

    logger.info(`FCM token removed for user ${userId}`);
    return true;
  } catch (error) {
    logger.error("Error removing FCM token:", error);
    throw error;
  }
};

/**
 * Get Tokens By User ID
 * Fetches the FCM tokens associated with a user from the database.
 *
 * @param {string} userId - The ID of the user for whom to fetch FCM tokens.
 * @returns {Array<string> | false} An array of FCM tokens for the user, or false if no tokens are found.
 */
const getTokenRecordsByUserId = async (userId) => {
  try {
    return FcmToken.find({
      user_id: userId,
      is_active: true,
    }).select('fcm_token notification_preferences');
  } catch (error) {
    logger.error(`Error fetching FCM tokens for user ${userId}: ${error}`);
    return [];
  }
};

const getTokensByUserId = async (userId) => {
  const tokenRecords = await getTokenRecordsByUserId(userId);
  if (!tokenRecords.length) return false;
  return tokenRecords.map((record) => record.fcm_token).filter(Boolean);
};

/**
 * Logs the delivery status of notifications.
 *
 * @param {object} response - The response object from sending notifications.
 * @param {number} response.failureCount - The count of failed deliveries.
 * @param {number} response.successCount - The count of successful deliveries.
 */
const logMessageDeliveryStatus = (response) => {
  if (response.failureCount > 0) {
    logger.warn(
      `Failed to send notifications to ${response.failureCount} devices`
    );
  }
  logger.info(`Notifications sent to ${response.successCount} devices`);
};

/**
 * Send Notification
 *
 * Sends notifications to a user with the specified custom data.
 *
 * @param {string} userId - The user's ID to send notifications to.
 * @param {string} title - The title of the notification.
 * @param {string} content - The content/body of the notification.
 * @param {Object} customData - Custom data to include in the notification.
 * @returns {Promise<boolean>} A promise that resolves to `true` if notifications are sent successfully,
 *                            or `false` if there's an error during the notification sending process.
 * @throws {Error} If there's a critical error during the notification sending process, this function may throw an error.
 */
const sendNotification = async (userId, title, content, customData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const recipientTokenRecords = await getTokenRecordsByUserId(userId);
      const topic = normalizeTopic(customData?.topic || customData?.category || customData?.type);
      const allowedTokenRecords = recipientTokenRecords.filter((tokenRecord) => (
        isPushAllowedForToken(tokenRecord, topic)
      ));

      if (!allowedTokenRecords.length) {
        resolve(false);
        return;
      }

      const sendResults = await Promise.all(
        allowedTokenRecords.map(async (tokenRecord) => {
          try {
            await sendFcmHttpV1Message({
              token: tokenRecord.fcm_token,
              title,
              body: content,
              data: customData,
            });
            return { success: true, tokenRecord };
          } catch (error) {
            return { success: false, tokenRecord, error };
          }
        })
      );

      const invalidTokenIds = sendResults
        .filter((result) => result.error?.isPermanentTokenError)
        .map((result) => result.tokenRecord._id);

      if (invalidTokenIds.length) {
        await FcmToken.updateMany(
          { _id: { $in: invalidTokenIds } },
          {
            $set: {
              is_active: false,
              last_used_at: new Date(),
            },
          }
        );
      }

      const successCount = sendResults.filter((result) => result.success).length;
      const failureCount = sendResults.length - successCount;
      logMessageDeliveryStatus({ successCount, failureCount });

      resolve(successCount > 0);
      // await createNotificationFromFcm(userId, title, content, customData);
    } catch (error) {
      // Handle any errors that occur during the notification sending process
      logger.error("Error sending notifications:", error);
      resolve(false); // Resolve to false if there's an error
    }
  });
};

/**
 * Check Token Validity
 * Sends a test notification to a token and checks if it is valid and active.
 *
 * @param {string} token - The FCM registration token to test.
 * @returns {Promise<boolean>} A promise that resolves to true if the token is valid and active, or false otherwise.
 */
module.exports = {
  saveFCMToken,
  removeFCMToken,
  sendNotification,
};
