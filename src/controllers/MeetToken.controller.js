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
      timeZone,
      orderId,
    } = req.body;
    const { userId } = req.query;
    // Assuming meetTokenService.createMeetToken returns the meetLink or message
    const response = await meetTokenService.createMeetToken({
      summary,
      location,
      description,
      startDateTime,
      endDateTime,
      timeZone,
      orderId,
      userId,
    });

    if (response.meetLink) {
      res.status(httpStatus.CREATED).json(response);
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
  const url = await meetTokenService.oauth2callback(req.query.code);
  res.status(httpStatus.CREATED).send(url);
});

const updateMeetEvent = catchAsync(async (req, res) => {
  try {
    const response = await meetTokenService.updateMeetEvent({
      eventId: req.body.eventId || req.body.googleCalendarEventId,
      calendarId: req.body.calendarId || req.body.googleCalendarId || "primary",
      summary: req.body.summary,
      location: req.body.location,
      description: req.body.description,
      startDateTime: req.body.startDateTime,
      endDateTime: req.body.endDateTime,
      timeZone: req.body.timeZone,
    });

    if (response.meetLink || response.eventId) {
      res.status(httpStatus.OK).json(response);
    } else if (response.authUrl) {
      res.status(httpStatus.OK).json({ authUrl: response.authUrl });
    } else {
      throw new Error("Unexpected response from updateMeetEvent");
    }
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: error.message });
  }
});

module.exports = {
  createMeetToken,
  updateMeetEvent,
  oauth2callback,
};
