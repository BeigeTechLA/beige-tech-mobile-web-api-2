const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const { meetingService, orderService, meetTokenService } = require("../services");

const EXTERNAL_MEETINGS_BASE_URL =
  process.env.EXTERNAL_MEETINGS_API_BASE_URL ||
  process.env.MEETINGS_API_BASE_URL ||
  "";
const EXTERNAL_MEETINGS_KEY =
  process.env.EXTERNAL_MEETINGS_KEY ||
  process.env.INTERNAL_FILE_MANAGER_KEY ||
  "beige-internal-dev-key";

const normalizeMeetingResult = (meeting, orderId) => {
  if (!meeting) return null;

  const normalized = typeof meeting.toObject === "function" ? meeting.toObject() : { ...meeting };
  const normalizedId = normalized.id || normalized._id || null;

  if (!normalized.id && normalizedId) {
    normalized.id = normalizedId;
  }

  if (!normalized.order && orderId) {
    normalized.order = {
      id: orderId,
      name: normalized.meeting_title || `Order ${orderId}`,
    };
  }

  delete normalized._id;
  delete normalized.__v;

  return normalized;
};

const getUserIdFromRequest = (req) =>
  req.user?.id || req.user?._id || req.user?.userId || null;

const buildProxyHeaders = (req) => {
  const headers = {
    "Content-Type": "application/json",
    "x-internal-key": EXTERNAL_MEETINGS_KEY,
  };

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return headers;
};

const proxyExternalMeetingsRequest = async (req, path, options = {}) => {
  if (!EXTERNAL_MEETINGS_BASE_URL) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, "External meetings service is not configured");
  }

  const response = await fetch(`${EXTERNAL_MEETINGS_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildProxyHeaders(req),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({
    success: false,
    message: "Invalid JSON response from meetings service",
  }));

  if (!response.ok) {
    const error = new ApiError(response.status, payload.message || "External meetings request failed");
    error.payload = payload;
    throw error;
  }

  return payload;
};

exports.getAllMeetings = async (req, res, next) => {
  try {
    const options = pick(req.query, ["sortBy", "limit", "page", "timeline"]);
    const result = await meetingService.getMeetings(options, req.query.search, req.query.status);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getMeetingById = async (req, res, next) => {
  try {
    const result = await meetingService.getMeetingById(req.params.meetingId);
    res.status(httpStatus.OK).json(result?.[0] || null);
  } catch (error) {
    next(error);
  }
};

exports.getMeetingsByOrder = async (req, res, next) => {
  try {
    const options = pick(req.query, ["sortBy", "limit", "page"]);
    const result = await meetingService.getMeetingByOrderId(options, req.params.orderId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getMeetingsByUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === "undefined" || userId === "null") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Valid user ID is required");
    }

    const options = pick(req.query, ["sortBy", "limit", "page", "timeline"]);
    const result = await meetingService.getMeetingsByUserId(
      options,
      userId,
      req.query.search,
      req.query.status
    );

    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

exports.createMeeting = async (req, res, next) => {
  try {
    const meeting = await meetingService.createMeeting(req.body);
    res.status(httpStatus.CREATED).json(meeting);
  } catch (error) {
    next(error);
  }
};

exports.updateMeeting = async (req, res, next) => {
  try {
    const meeting = await meetingService.updateMeetingById(req.params.meetingId, req.body);
    res.status(httpStatus.OK).json(normalizeMeetingResult(meeting));
  } catch (error) {
    next(error);
  }
};

exports.deleteMeeting = async (req, res, next) => {
  try {
    const { meetingId } = req.params;
    await meetingService.deleteMeetingById(meetingId);
    await orderService.removeMeetingFromOrder(meetingId);
    res.sendStatus(httpStatus.NO_CONTENT);
  } catch (error) {
    next(error);
  }
};

exports.placeChangeRequest = async (req, res, next) => {
  try {
    const meeting = await meetingService.placeChangeRequest(req.params.meetingId, req.body);
    res.status(httpStatus.OK).json(normalizeMeetingResult(meeting));
  } catch (error) {
    next(error);
  }
};

exports.updateChangeRequestStatus = async (req, res, next) => {
  try {
    const meeting = await meetingService.updateChangeRequestStatus(
      req.params.meetingId,
      req.params.status
    );
    res.status(httpStatus.OK).json(normalizeMeetingResult(meeting));
  } catch (error) {
    next(error);
  }
};

exports.addParticipants = async (req, res, next) => {
  try {
    const meeting = await meetingService.addMeetingParticipants(req.params.meetingId, req.body);
    const details = await meetingService.getMeetingById(req.params.meetingId);
    res.status(httpStatus.OK).json(details?.[0] || normalizeMeetingResult(meeting));
  } catch (error) {
    next(error);
  }
};

exports.removeParticipant = async (req, res, next) => {
  try {
    const meeting = await meetingService.removeMeetingParticipant(
      req.params.meetingId,
      req.params.userId,
      req.body.role
    );
    const details = await meetingService.getMeetingById(req.params.meetingId);
    res.status(httpStatus.OK).json(details?.[0] || normalizeMeetingResult(meeting));
  } catch (error) {
    next(error);
  }
};

exports.respondToMeetingInvitation = async (req, res, next) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "Authentication is required");
    }

    const meeting = await meetingService.respondToMeetingInvitation(
      req.params.meetingId,
      userId,
      req.body.response,
      req.body.notificationId
    );

    const details = await meetingService.getMeetingById(req.params.meetingId);
    res.status(httpStatus.OK).json(details?.[0] || normalizeMeetingResult(meeting));
  } catch (error) {
    next(error);
  }
};

exports.createMeetEvent = async (req, res, next) => {
  try {
    const payload = {
      summary: req.body.summary,
      location: req.body.location,
      description: req.body.description,
      startDateTime: req.body.startDateTime,
      endDateTime: req.body.endDateTime,
      orderId: req.body.orderId,
      userId: req.body.userId || req.query.userId || getUserIdFromRequest(req),
    };

    let response = null;

    if (EXTERNAL_MEETINGS_BASE_URL) {
      response = await proxyExternalMeetingsRequest(req, "/create-event", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } else {
      response = await meetTokenService.createMeetToken(payload);
    }

    if (response?.meetLink) {
      return res.status(httpStatus.CREATED).json({ meetLink: response.meetLink });
    }

    if (response?.authUrl) {
      return res.status(httpStatus.OK).json({ authUrl: response.authUrl });
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Unexpected response from meet token service");
  } catch (error) {
    next(error);
  }
};
