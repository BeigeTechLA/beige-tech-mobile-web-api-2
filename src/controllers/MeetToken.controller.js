const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { meetTokenService } = require("../services");

const getCreateEventIdentity = (req) => {
  if (req.authMode === "internal-bridge") {
    return {
      userId:
        req.body.userId ||
        req.body.appUserId ||
        req.headers["x-app-user-id"] ||
        req.headers["x-user-id"] ||
        null,
      appUserEmail:
        req.body.appUserEmail ||
        req.body.userEmail ||
        req.headers["x-app-user-email"] ||
        req.headers["x-user-email"] ||
        null,
    };
  }

  return {
    userId: req.user?.id || req.user?._id,
    appUserEmail: req.user?.email,
  };
};

const createMeetToken = catchAsync(async (req, res) => {
  try {
    const {
      summary,
      location,
      description,
      startDateTime,
      endDateTime,
      orderId,
    } = req.body;
    const { userId, appUserEmail } = getCreateEventIdentity(req);
    const selectedGoogleEmail =
      req.body.selectedGoogleEmail ||
      req.body.googleEmail ||
      req.query.selectedGoogleEmail ||
      req.query.googleEmail;

    if (!userId || !appUserEmail) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "Authenticated user id and email are required");
    }

    console.log("[Google Calendar] Create-event request user", {
      authMode: req.authMode || "jwt",
      appUserId: userId?.toString(),
      appUserEmail,
      selectedGoogleEmail,
    });

    const response = await meetTokenService.createMeetToken({
      summary,
      location,
      description,
      startDateTime,
      endDateTime,
      orderId,
      userId,
      appUserEmail,
      selectedGoogleEmail,
    });

    if (response.meetLink) {
      res.status(httpStatus.CREATED).json({ meetLink: response.meetLink });
    } else if (response.authUrl) {
      res.status(httpStatus.OK).json({ authUrl: response.authUrl });
    } else {
      throw new Error("Unexpected response from createMeetToken");
    }
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: error.message });
  }
});

const oauth2callback = catchAsync(async (req, res) => {
  const url = await meetTokenService.oauth2callback(req.query.code, req.query.state);
  res.status(httpStatus.CREATED).send(url);
});

module.exports = {
  createMeetToken,
  oauth2callback,
};
