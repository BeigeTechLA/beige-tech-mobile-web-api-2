const jwt = require("jsonwebtoken");
const { SCOPES } = require("../utils/meetToken.utils");
const { credentials } = require("../utils/meetToken.utils");
const { MeetToken, Order, User } = require("../models");
const { google } = require("googleapis");
const readline = require("readline");
const emailService = require("./email.service");
const orderService = require("./order.service");
const { format, parseISO } = require("date-fns");
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
    return await oauth2callback(data.code);
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
    const { summary, location, description, startDateTime, endDateTime, userId } = data;

    // Build attendees list - add the meeting creator if userId is provided
    const attendees = [];
    if (userId) {
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

    authorize(async (auth, authUrl) => {
      if (authUrl) {
        resolve({
          authUrl,
        });
      } else {
        const calendar = google.calendar({ version: "v3", auth });
        calendar.events.insert(
          {
            auth,
            calendarId: "primary",
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
async function authorize(callback) {
  const { client_secret, client_id } = credentials.installed;
  
  // Use the environment variable here instead of redirect_uris[0]
  const redirectUri = process.env.GOOGLE_REDIRECT_URI; 

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );

  try {
    const tokenDoc = await MeetToken.findOne({});

    if (!tokenDoc) {
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent", // force consent screen to get a new refresh token
        scope: SCOPES,
      });
      callback(null, authUrl);
    } else {
      oAuth2Client.setCredentials(tokenDoc.toObject());

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

          await MeetToken.updateOne({}, newCredentials);

          oAuth2Client.setCredentials(newCredentials);
          callback(oAuth2Client);
        } catch (err) {
          console.error("Error refreshing access token:", err);
          const authUrl = oAuth2Client.generateAuthUrl({
            access_type: "offline",
            prompt: "consent", // force consent screen to get a new refresh token
            scope: SCOPES,
          });
          callback(null, authUrl);
        }
      } else {
        callback(oAuth2Client);
      }
    }
  } catch (err) {
    console.error("Error retrieving token from DB:", err);
  }
}

/**
 * Handle OAuth2 callback
 * @param {string} code Authorization code from OAuth2 callback
 * @returns {Promise<{ message: string }>}
 */
const oauth2callback = async (code) => {
  if (code) {
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

      const tokenDoc = new MeetToken(tokens);
      await tokenDoc.save();
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
