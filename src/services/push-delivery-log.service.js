const crypto = require('crypto');
const { PushDeliveryLog } = require('../models');

const TRACE_TTL_MS = 12 * 60 * 60 * 1000;

const createTraceId = () => `push_${crypto.randomUUID()}`;

const createTrace = async ({ traceId, userId, title, data = {} }) => {
  const resolvedTraceId = traceId || createTraceId();
  const topic = data.topic || data.category || null;

  await PushDeliveryLog.create({
    trace_id: resolvedTraceId,
    user_id: userId == null ? null : String(userId),
    title: title || null,
    topic,
    type: data.type || null,
    reference_id: data.reference_id || data.booking_id || data.meeting_id || data.room_id || null,
    reference_type: data.reference_type || null,
    status: 'received',
    expires_at: new Date(Date.now() + TRACE_TTL_MS),
    events: [{
      step: 'push_request_received',
      status: 'info',
      message: 'Central push service received the notification request.',
    }],
  });

  return resolvedTraceId;
};

const addEvent = (traceId, event) => PushDeliveryLog.updateOne(
  { trace_id: traceId },
  { $push: { events: { ...event, created_at: new Date() } } }
);

const updateStatus = (traceId, status) => PushDeliveryLog.updateOne(
  { trace_id: traceId },
  { $set: { status } }
);

const findTraces = ({ traceId, userId, referenceId, referenceType, limit = 50 }) => {
  const query = {};
  if (traceId) query.trace_id = traceId;
  if (userId != null && userId !== '') query.user_id = String(userId);
  if (referenceId) query.reference_id = String(referenceId);
  if (referenceType) query.reference_type = String(referenceType);

  return PushDeliveryLog.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
    .lean();
};

module.exports = { createTraceId, createTrace, addEvent, updateStatus, findTraces };
