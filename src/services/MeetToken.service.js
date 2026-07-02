const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { SCOPES } = require("../utils/meetToken.utils");
const { credentials } = require("../utils/meetToken.utils");
const { MeetToken, Order, User } = require("../models");
const { google } = require("googleapis");
const readline = require("readline");
const emailService = require("./email.service");
const orderService = require("./order.service");
const { format, parseISO } = require("date-fns");

const CALENDAR_ID = "primary";

const normalizeEmail = (email) => (email ? String(email).trim().toLowerCase() : null);

const normalizeAppUserId = (userId) => (userId ? String(userId).trim() : null);

const toTokenUserId = (userId) => {
  const normalizedUserId = normalizeAppUserId(userId);

  if (!normalizedUserId) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(normalizedUserId)) {
    return new mongoose.Types.ObjectId(normalizedUserId);
  }

  return normalizedUserId;
};

const encodeOAuthState = (state) =>
  Buffer.from(JSON.stringify(state)).toString("base64url");

const decodeOAuthState = (state) => {
  if (!state) return {};

  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch (err) {
    console.error("Invalid Google OAuth state:", err.message);
    return {};
  }
};

const buildTokenQuery = ({ userId, selectedGoogleEmail }) => {
  const tokenUserId = toTokenUserId(userId);

  if (!tokenUserId) {
    throw new Error("Authenticated user id is required for Google Calendar token lookup");
  }

  const query = { userId: tokenUserId };

  if (selectedGoogleEmail) {
    query.googleEmail = normalizeEmail(selectedGoogleEmail);
  }

  return query;
};

const buildAuthUrl = (oAuth2Client, context = {}) =>
  oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: encodeOAuthState({
      userId: context.userId || null,
      appUserEmail: normalizeEmail(context.appUserEmail),
      selectedGoogleEmail: normalizeEmail(context.selectedGoogleEmail),
    }),
  });

const getGoogleAccountEmail = async (auth) => {
  try {
    const oauth2 = google.oauth2({ version: "v2", auth });
    const { data } = await oauth2.userinfo.get();
    return normalizeEmail(data?.email);
  } catch (err) {
    console.error("Could not read Google account email:", err.message);
    return null;
  }
};

const toGoogleCredentials = (tokenDoc) => ({
  access_token: tokenDoc.access_token,
  refresh_token: tokenDoc.refresh_token,
  scope: tokenDoc.scope,
  token_type: tokenDoc.token_type,
  expiry_date: tokenDoc.expiry_date,
});
/**
 * Create meet token or handle OAuth2 callback
 * @param {Object} data Data needed for creating a meet token
 * @param {string} data.summary Summary of the event
 * @param {string} data.location Location of the event
 * @param {string} data.description Description of the event
 * @param {string} data.startDateTime Start date and time of the event
 * @param {string} data.endDateTime End date and time of the event
 * @param {string} [code] Authorization code for OAuth2 callback
 * @returns {Promise<{ meetLink: string } | { message: string }>}
 */
const createMeetToken = async (data) => {
  if (data.code) {
    // Handle OAuth2 callback
    return await oauth2callback(data.code, data.state);
  } else {
    // Create meet token
    return await generateMeetLink(data);
  }
};

/**
 * Generate meet link
 * @param {Object} data Data needed for creating a meet token
 * @param {string} data.summary Summary of the event
 * @param {string} data.location Location of the event
 * @param {string} data.description Description of the event
 * @param {string} data.startDateTime Start date and time of the event
 * @param {string} data.endDateTime End date and time of the event
 * @returns {Promise<{ meetLink: string } | { message: string }>}
 */
const generateMeetLink = async (data) => {
  return new Promise(async (resolve, reject) => {
    const {
      summary,
      location,
      description,
      startDateTime,
      endDateTime,
      userId,
      appUserEmail,
      selectedGoogleEmail,
    } = data;

    if (!userId || !appUserEmail) {
      reject(new Error("Authenticated user id and email are required to create a Google Calendar event"));
      return;
    }

    // Build attendees list - add the meeting creator if userId is provided
    const attendees = [];
    if (mongoose.Types.ObjectId.isValid(normalizeAppUserId(userId))) {
      try {
        const creator = await User.findById(userId);
        if (creator && creator.email) {
          attendees.push({ email: creator.email });
        }
      } catch (err) {
        console.log("Could not fetch user for attendee:", err.message);
      }
    }

    const event = {
      summary,
      location,
      description,
      start: {
        dateTime: startDateTime,
        timeZone: "America/Los_Angeles",
      },
      end: {
        dateTime: endDateTime,
        timeZone: "America/Los_Angeles",
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      // Add attendees (meeting creator + others)
      attendees: attendees.length > 0 ? attendees : undefined,
      // Allow guests to join without asking permission
      guestsCanModify: false,
      guestsCanInviteOthers: true,
      guestsCanSeeOtherGuests: true,
    };

    authorize({ userId, appUserEmail, selectedGoogleEmail }, async (auth, authUrl, tokenDoc, authError) => {
      if (authError) {
        reject(authError);
        return;
      }

      if (authUrl) {
        resolve({
          authUrl,
        });
      } else {
        console.log("[Google Calendar] Creating event", {
          appUserId: normalizeAppUserId(userId),
          appUserEmail: normalizeEmail(appUserEmail),
          selectedGoogleEmail: normalizeEmail(selectedGoogleEmail),
          tokenId: tokenDoc?._id?.toString(),
          tokenGoogleEmail: tokenDoc?.googleEmail || null,
          calendarId: CALENDAR_ID,
        });

        const calendar = google.calendar({ version: "v3", auth });
        calendar.events.insert(
          {
            auth,
            calendarId: CALENDAR_ID,
            resource: event,
            conferenceDataVersion: 1,
            sendUpdates: "all", // Send email invitations to attendees
          },
          async (err, event) => {
            if (err) {
              console.error("Error creating event:", err);
              reject(new Error("Error creating event: " + err.message));
              return;
            }
            // Extract Meet link from event data
            const meetLink = event.data.conferenceData.entryPoints.find(
              (entry) => entry.entryPointType === "video"
            )?.uri;
            resolve({ meetLink });

            // Only attempt to send emails if orderId is provided
            if (data?.orderId) {
              try {
                // Find the order and check if it exists
                const order = await Order.findById(data.orderId).populate({
                  path: "cp_ids.id",
                  model: "User",
                });

                // Check if order exists and has cp_ids
                if (order && order?.cp_ids && order?.cp_ids?.length > 0) {
                  // send the meetlink to attendees
                  order.cp_ids.forEach((cp) => {
                    const subject = "Meeting Invitation";
                    const text = `
Dear attendee,
Please join the meeting scheduled for ${formatDateTime(
                      startDateTime
                    )} (America/Los_Angeles) about "${summary}" order using the link below:
${meetLink}`;

                    if (cp?.id?.email) {
                      emailService.sendEmail(cp.id.email, subject, text);
                    }
                  });
                }
              } catch (error) {
                console.error("Error sending meeting invitations:", error);
                // Don't reject the promise since the meet link was already created successfully
              }
            }
          }
        );
      }
    });
  });
};

/**
 * Authorize and get OAuth2 client
 * @param {function} callback Callback function with authorized OAuth2 client
 */
async function authorize(context, callback) {
  if (!context.userId || !context.appUserEmail) {
    callback(
      null,
      null,
      null,
      new Error("Authenticated user id and email are required for Google Calendar authorization")
    );
    return;
  }

  const { client_secret, client_id } = credentials.installed;
  
  // Use the environment variable here instead of redirect_uris[0]
  const redirectUri = process.env.GOOGLE_REDIRECT_URI; 

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );

  try {
    const query = buildTokenQuery(context);
    const tokenDoc = await MeetToken.findOne(query);

    console.log("[Google Calendar] Token lookup", {
      appUserId: normalizeAppUserId(context.userId),
      appUserEmail: normalizeEmail(context.appUserEmail),
      selectedGoogleEmail: normalizeEmail(context.selectedGoogleEmail),
      query,
      matchedTokenId: tokenDoc?._id?.toString() || null,
      matchedGoogleEmail: tokenDoc?.googleEmail || null,
      calendarId: CALENDAR_ID,
    });

    if (!tokenDoc) {
      const authUrl = buildAuthUrl(oAuth2Client, context);
      callback(null, authUrl);
    } else {
      oAuth2Client.setCredentials(toGoogleCredentials(tokenDoc));

      // Check if access token is expired
      if (tokenDoc.expiry_date <= Date.now()) {
        try {
          const newToken = await oAuth2Client.refreshAccessToken();

          // Update token with new access token and expiry date
          const newCredentials = {
            access_token: newToken.credentials.access_token,
            refresh_token:
              newToken.credentials.refresh_token || tokenDoc.refresh_token,
            token_type: newToken.credentials.token_type,
            expiry_date: newToken.credentials.expiry_date,
          };

          await MeetToken.updateOne({ _id: tokenDoc._id }, newCredentials);

          oAuth2Client.setCredentials(newCredentials);
          callback(oAuth2Client, null, tokenDoc);
        } catch (err) {
          console.error("Error refreshing access token:", err);
          const authUrl = buildAuthUrl(oAuth2Client, context);
          callback(null, authUrl);
        }
      } else {
        callback(oAuth2Client, null, tokenDoc);
      }
    }
  } catch (err) {
    console.error("Error retrieving token from DB:", err);
    callback(null, null, null, err);
  }
}

/**
 * Handle OAuth2 callback
 * @param {string} code Authorization code from OAuth2 callback
 * @returns {Promise<{ message: string }>}
 */
const oauth2callback = async (code, state) => {
  if (code) {
    const context = decodeOAuthState(state);

    if (!context.userId || !context.appUserEmail) {
      console.error("[Google Calendar] OAuth callback missing app user context", {
        appUserId: normalizeAppUserId(context.userId),
        appUserEmail: normalizeEmail(context.appUserEmail),
      });
      return {
        message: "Authorization failed. Missing logged-in user context.",
      };
    }

    const { client_secret, client_id } = credentials.installed;
    
    // Use the same environment variable here
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      // Check if refresh token is received
      if (!tokens.refresh_token) {
        console.error("No refresh token received.");
        return {
          message: "No refresh token received. Please authorize the app again.",
        };
      }

      const googleEmail =
        (await getGoogleAccountEmail(oAuth2Client)) ||
        normalizeEmail(context.selectedGoogleEmail);

      const tokenPayload = {
        ...tokens,
        userId: toTokenUserId(context.userId) || undefined,
        appUserEmail: normalizeEmail(context.appUserEmail) || undefined,
        googleEmail: googleEmail || undefined,
      };

      const tokenQuery = buildTokenQuery({
        userId: context.userId,
        selectedGoogleEmail: googleEmail,
      });

      const tokenDoc = await MeetToken.findOneAndUpdate(tokenQuery, tokenPayload, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      });

      console.log("[Google Calendar] Saved OAuth token", {
        appUserId: normalizeAppUserId(context.userId),
        appUserEmail: normalizeEmail(context.appUserEmail),
        selectedGoogleEmail: normalizeEmail(context.selectedGoogleEmail),
        tokenId: tokenDoc?._id?.toString(),
        tokenGoogleEmail: tokenDoc?.googleEmail || null,
        calendarId: CALENDAR_ID,
      });

      return { message: "Authorization successful! You can close this tab." };
    } catch (err) {
      console.error("Error retrieving access token", err);
      return { message: "Error retrieving access token" };
    }
  } else {
    return { message: "Authorization code is missing" };
  }
};
//

function formatDateTime(dateTimeString) {
  // Parse the ISO date-time string into a Date object
  const dateObj = parseISO(dateTimeString);
  // Format components
  const formattedDate = format(dateObj, "MMMM dd, yyyy"); // Format date like "July 30, 2024"
  const formattedTime = format(dateObj, "hh:mm a"); // Format time like "03:00 PM"
  // Combine date and time with AM/PM
  const formattedDateTime = `${formattedDate} Time: ${formattedTime}`;
  return formattedDateTime;
}
module.exports = {
  createMeetToken,
  oauth2callback,
};
