/**
 * FCM Service
 * This module handles sending notifications via Firebase Cloud Messaging (FCM) to users.
 */

const logger = require("../config/logger");
const { FcmToken, FcmPreference } = require("../models");
const { sendFcmHttpV1Message } = require("../helpers/firebase-http.helper");
const { getFirebaseProjectForToken } = require("../config/firebase-http");
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

const DEFAULT_NOTIFICATION_PREFERENCES = {
  push_enabled: true,
  topics: Object.fromEntries(Array.from(NOTIFICATION_TOPICS).map((topic) => [topic, true])),
};

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

const mergeWithDefaultPreferences = (preferences = {}) => {
  const plainPreferences = preferences?.toObject ? preferences.toObject() : preferences || {};
  const plainTopics = plainPreferences.topics?.toObject
    ? plainPreferences.topics.toObject()
    : plainPreferences.topics || {};

  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    push_enabled: typeof plainPreferences.push_enabled === 'boolean'
      ? plainPreferences.push_enabled
      : DEFAULT_NOTIFICATION_PREFERENCES.push_enabled,
    topics: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.topics,
      ...plainTopics,
    },
  };
};

const saveSessionPreferences = async ({
  userId,
  sessionId,
  notificationPreferences,
}) => {
  const normalizedUserId = normalizeString(userId);
  const normalizedSessionId = normalizeString(sessionId);

  if (!normalizedUserId || !normalizedSessionId) return null;
  if (!notificationPreferences || !Object.keys(notificationPreferences).length) return null;

  return FcmPreference.findOneAndUpdate(
    {
      user_id: normalizedUserId,
      session_id: normalizedSessionId,
    },
    {
      $set: {
        notification_preferences: notificationPreferences,
        is_active: true,
        last_used_at: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const getSessionPreferences = async ({ userId, sessionId }) => {
  const normalizedUserId = normalizeString(userId);
  const normalizedSessionId = normalizeString(sessionId);

  if (!normalizedUserId || !normalizedSessionId) return DEFAULT_NOTIFICATION_PREFERENCES;

  const preferenceRecord = await FcmPreference.findOne({
    user_id: normalizedUserId,
    session_id: normalizedSessionId,
    is_active: true,
  }).select('notification_preferences');

  if (preferenceRecord) {
    return mergeWithDefaultPreferences(preferenceRecord.notification_preferences);
  }

  const tokenRecord = await FcmToken.findOne({
    user_id: normalizedUserId,
    session_id: normalizedSessionId,
    is_active: true,
  }).select('notification_preferences');

  return mergeWithDefaultPreferences(tokenRecord?.notification_preferences);
};

const isPushAllowedForPreferences = (preferences, topic) => {
  if (preferences.push_enabled === false) return false;

  const topics = preferences.topics || {};
  if (topics[topic] === false) return false;

  return true;
};

const saveFCMToken = async (userId, registrationToken, options = {}) => {
  try {
    const normalizedUserId = normalizeString(userId);
    const fcmToken = normalizeString(registrationToken || options.fcm_token);
    const sessionId = normalizeString(options.session_id);
    const notificationPreferences = normalizeNotificationPreferences(options.notification_preferences || {});

    if (!normalizedUserId || !fcmToken) {
      throw new ApiError(httpStatus.BAD_REQUEST, "userId and registrationToken are required");
    }

    const payload = {
      user_id: normalizedUserId,
      fcm_token: fcmToken,
      session_id: sessionId,
      device_type: normalizeDeviceType(options.device_type),
      app_user_type: normalizeString(options.app_user_type),
      is_active: true,
      last_used_at: new Date(),
    };

    const hasNotificationPreferences = Object.keys(notificationPreferences).length > 0;

    if (hasNotificationPreferences) {
      payload.notification_preferences = notificationPreferences;
    }

    let tokensRecord = await FcmToken.findOne({ fcm_token: fcmToken });

    if (tokensRecord) {
      const tokenChangedOwner = String(tokensRecord.user_id || '') !== normalizedUserId ||
        String(tokensRecord.session_id || '') !== String(sessionId || '');

      if (tokenChangedOwner && !hasNotificationPreferences) {
        payload.notification_preferences = DEFAULT_NOTIFICATION_PREFERENCES;
      }

      tokensRecord = await FcmToken.findByIdAndUpdate(
        tokensRecord._id,
        { $set: payload },
        { new: true, setDefaultsOnInsert: true }
      );
    } else {
      tokensRecord = await FcmToken.findOneAndUpdate(
        sessionId ? { user_id: normalizedUserId, session_id: sessionId } : { fcm_token: fcmToken },
        { $set: payload },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    if (sessionId && tokensRecord?._id) {
      if (hasNotificationPreferences) {
        await saveSessionPreferences({
          userId: normalizedUserId,
          sessionId,
          notificationPreferences,
        });
      }

      await FcmToken.updateMany(
        {
          user_id: normalizedUserId,
          session_id: sessionId,
          _id: { $ne: tokensRecord._id },
          is_active: true,
        },
        {
          $set: {
            is_active: false,
            last_used_at: new Date(),
          },
        }
      );
    }

    logger.info(`FCM token saved for user ${normalizedUserId}`);
    return tokensRecord;
  } catch (error) {
    logger.error("Error saving FCM token:", error);
    throw error;
  }
};

const removeFCMToken = async (userId, registrationToken, options = {}) => {
  try {
    const normalizedUserId = normalizeString(userId);
    const fcmToken = normalizeString(registrationToken);
    const sessionId = normalizeString(options.session_id);

    if (!normalizedUserId || (!fcmToken && !sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "userId and registrationToken or session_id are required");
    }

    await FcmToken.updateOne(
      sessionId
        ? { user_id: normalizedUserId, session_id: sessionId }
        : { user_id: normalizedUserId, fcm_token: fcmToken },
      {
        $set: {
          is_active: false,
          last_used_at: new Date(),
        },
      }
    );

    logger.info(`FCM token removed for user ${normalizedUserId}`);
    return true;
  } catch (error) {
    logger.error("Error removing FCM token:", error);
    throw error;
  }
};

const updateNotificationPreferences = async (userId, options = {}) => {
  try {
    const normalizedUserId = normalizeString(userId);
    const sessionId = normalizeString(options.session_id);
    const notificationPreferences = normalizeNotificationPreferences(options.notification_preferences || {});

    if (!normalizedUserId || !sessionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "userId and session_id are required");
    }

    if (!Object.keys(notificationPreferences).length) {
      throw new ApiError(httpStatus.BAD_REQUEST, "notification_preferences is required");
    }

    const updatedPreference = await saveSessionPreferences({
      userId: normalizedUserId,
      sessionId,
      notificationPreferences,
    });

    await FcmToken.updateMany(
      {
        user_id: normalizedUserId,
        session_id: sessionId,
        is_active: true,
      },
      {
        $set: {
          notification_preferences: notificationPreferences,
          last_used_at: new Date(),
        },
      }
    );

    logger.info(`FCM notification preferences updated for user ${normalizedUserId}`);
    return updatedPreference;
  } catch (error) {
    logger.error("Error updating FCM notification preferences:", error);
    throw error;
  }
};

const getNotificationPreferences = async (userId, options = {}) => {
  try {
    const normalizedUserId = normalizeString(userId);
    const sessionId = normalizeString(options.session_id);

    if (!normalizedUserId || !sessionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "userId and session_id are required");
    }

    return getSessionPreferences({
      userId: normalizedUserId,
      sessionId,
    });
  } catch (error) {
    logger.error("Error fetching FCM notification preferences:", error);
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
    const normalizedUserId = normalizeString(userId);
    if (!normalizedUserId) return [];

    return FcmToken.find({
      user_id: normalizedUserId,
      is_active: true,
    }).select('fcm_token session_id app_user_type device_type notification_preferences');
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
  return new Promise(async (resolve) => {
    try {
      const normalizedUserId = normalizeString(userId);
      const recipientTokenRecords = await getTokenRecordsByUserId(userId);
      const topic = normalizeTopic(customData?.topic || customData?.category || customData?.type);
      const tokenRecordsWithPreferences = await Promise.all(
        recipientTokenRecords.map(async (tokenRecord) => ({
          tokenRecord,
          preferences: await getSessionPreferences({
            userId: tokenRecord.user_id,
            sessionId: tokenRecord.session_id,
          }),
        }))
      );
      const allowedTokenRecords = tokenRecordsWithPreferences
        .filter(({ preferences }) => isPushAllowedForPreferences(preferences, topic))
        .map(({ tokenRecord }) => tokenRecord);
      const blockedTokenRecords = tokenRecordsWithPreferences
        .filter(({ preferences }) => !isPushAllowedForPreferences(preferences, topic))
        .map(({ tokenRecord }) => tokenRecord);

      if (!allowedTokenRecords.length) {
        resolve({
          success: false,
          debug: {
            user_id: normalizedUserId,
            topic,
            active_token_count: recipientTokenRecords.length,
            preference_allowed_token_count: 0,
            preference_blocked_token_count: blockedTokenRecords.length,
            reason: recipientTokenRecords.length
              ? 'PUSH_DISABLED_BY_SESSION_PREFERENCES'
              : 'NO_ACTIVE_FCM_TOKENS_FOR_USER',
          },
        });
        return;
      }

      const sendResults = await Promise.all(
        allowedTokenRecords.map(async (tokenRecord) => {
          try {
            const firebaseProject = getFirebaseProjectForToken({
              appUserType: tokenRecord.app_user_type,
              deviceType: tokenRecord.device_type,
            });

            await sendFcmHttpV1Message({
              token: tokenRecord.fcm_token,
              title,
              body: content,
              data: customData,
              projectKey: firebaseProject.key,
            });
            return {
              success: true,
              tokenRecord,
              projectKey: firebaseProject.key,
            };
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

      resolve({
        success: successCount > 0,
        debug: {
          user_id: normalizedUserId,
          topic,
          active_token_count: recipientTokenRecords.length,
          preference_allowed_token_count: allowedTokenRecords.length,
          preference_blocked_token_count: blockedTokenRecords.length,
          success_count: successCount,
          failure_count: failureCount,
          failures: sendResults
            .filter((result) => !result.success)
            .map((result) => ({
              token_id: result.tokenRecord?._id ? String(result.tokenRecord._id) : null,
              session_id: result.tokenRecord?.session_id || null,
              app_user_type: result.tokenRecord?.app_user_type || null,
              device_type: result.tokenRecord?.device_type || null,
              error_message: result.error?.message || null,
              firebase_error_code: result.error?.firebaseErrorCode || null,
              error_code: result.error?.code || null,
              http_code: result.error?.httpCode || null,
              is_permanent_token_error: !!result.error?.isPermanentTokenError,
            })),
        },
      });
      // await createNotificationFromFcm(userId, title, content, customData);
    } catch (error) {
      // Handle any errors that occur during the notification sending process
      logger.error("Error sending notifications:", error);
      resolve({
        success: false,
        debug: {
          user_id: normalizeString(userId),
          reason: 'SEND_NOTIFICATION_EXCEPTION',
          error_message: error.message || String(error),
          error_code: error.code || null,
        },
      });
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
  updateNotificationPreferences,
  getNotificationPreferences,
  sendNotification,
};
