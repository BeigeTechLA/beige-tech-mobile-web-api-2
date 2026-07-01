const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { meetTokenService } = require("../services");

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
    const userId = req.body.userId || req.query.userId || req.user?.id || req.user?._id;
    const appUserEmail = req.body.appUserEmail || req.query.appUserEmail || req.user?.email;
    const selectedGoogleEmail =
      req.body.selectedGoogleEmail ||
      req.body.googleEmail ||
      req.query.selectedGoogleEmail ||
      req.query.googleEmail;

    // Assuming meetTokenService.createMeetToken returns the meetLink or message
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
