const httpStatus = require("http-status");
const pick = require("../utils/pick");
const catchAsync = require("../utils/catchAsync");
const { meetingService, orderService } = require("../services");

const getMeetings = catchAsync(async (req, res) => {
  const options = pick(req.query, ["sortBy", "limit", "page", "timeline"]);
  const search = req.query.search;
  const status = req.query.status;
  const result = await meetingService.getMeetings(options, search, status);
  res.json(result);
});

const getMeetingById = catchAsync(async (req, res) => {
  const meetingId = req.params.meetingId;
  const result = await meetingService.getMeetingById(meetingId);
  res.json(result[0]);
});

const getMeetingsByOrderId = catchAsync(async (req, res) => {
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const orderId = req.params.orderId;
  const result = await meetingService.getMeetingByOrderId(options, orderId);
  res.json(result);
});

const getMeetingsByUserId = catchAsync(async (req, res) => {
  const options = pick(req.query, ["sortBy", "limit", "page", "timeline"]);
  const userId = req.params.userId;
  const search = req.query.search;
  const status = req.query.status;

  // Validate userId parameter
  if (!userId || userId === 'undefined' || userId === 'null') {
    throw new ApiError(httpStatus.BAD_REQUEST, "Valid user ID is required");
  }

  const result = await meetingService.getMeetingsByUserId(options, userId, search, status);
  res.json(result);
});

const createMeeting = catchAsync(async (req, res) => {
  const meeting = await meetingService.createMeeting(req.body);
  res.status(httpStatus.CREATED).json(meeting);
});

const deleteMeeting = catchAsync(async (req, res) => {
  const { meeting_id } = req.params;

  // Delete the meeting from the meeting collection
  await meetingService.deleteMeetingById(meeting_id);

  // Remove the meeting ID from the order's meeting_date_times array
  await orderService.removeMeetingFromOrder(meeting_id);

  // Send response status
  res.sendStatus(httpStatus.NO_CONTENT);
});

const updateMeeting = catchAsync(async (req, res) => {
  const { meeting_id } = req.params;
  const updatedMeeting = await meetingService.updateMeetingById(
    meeting_id,
    req.body
  );
  res.json(updatedMeeting);
});

const placeChangeRequest = catchAsync(async (req, res) => {
  const { meeting_id } = req.params;
  const placeChangeRequest = await meetingService.placeChangeRequest(
    meeting_id,
    req.body
  );
  res.json(placeChangeRequest);
});

const updateChangeRequestStatus = catchAsync(async (req, res) => {
  const { meeting_id, status } = req.params;
  const updateChangeRequestStatus =
    await meetingService.updateChangeRequestStatus(meeting_id, status);
  res.json(updateChangeRequestStatus);
});

const addParticipants = catchAsync(async (req, res) => {
  const { meetingId } = req.params;
  const meeting = await meetingService.addMeetingParticipants(meetingId, req.body);
  res.json(meeting);
});

const removeParticipant = catchAsync(async (req, res) => {
  const { meetingId, userId } = req.params;
  const { role } = req.body;
  const meeting = await meetingService.removeMeetingParticipant(meetingId, userId, role);
  res.json(meeting);
});

const respondToMeetingInvitation = catchAsync(async (req, res) => {
  const { meetingId } = req.params;
  const { response, notificationId } = req.body;
  const userId = req.user.id;

  const meeting = await meetingService.respondToMeetingInvitation(meetingId, userId, response, notificationId);
  res.json(meeting);
});

module.exports = {
  getMeetings,
  getMeetingById,
  getMeetingsByOrderId,
  getMeetingsByUserId,
  createMeeting,
  deleteMeeting,
  updateMeeting,
  placeChangeRequest,
  updateChangeRequestStatus,
  addParticipants,
  removeParticipant,
  respondToMeetingInvitation,
};
