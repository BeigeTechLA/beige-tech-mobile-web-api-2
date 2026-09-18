const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { fcmService } = require('../services');
const pushDeliveryLogService = require('../services/push-delivery-log.service');

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const saveToken = catchAsync(async (req, res) => {
  const token = await fcmService.saveFCMToken(req.body.user_id, req.body.registrationToken, {
    session_id: req.body.session_id,
    device_type: req.body.device_type,
    app_user_type: req.body.app_user_type,
    notification_preferences: req.body.notification_preferences,
  });

  res.status(httpStatus.OK).send(token);
});

const removeToken = catchAsync(async (req, res) => {
  await fcmService.removeFCMToken(req.body.user_id, req.body.registrationToken, {
    session_id: req.body.session_id,
  });

  res.status(httpStatus.NO_CONTENT).send();
});

const updatePreferences = catchAsync(async (req, res) => {
  const token = await fcmService.updateNotificationPreferences(req.body.user_id, {
    session_id: req.body.session_id,
    notification_preferences: req.body.notification_preferences,
  });

  res.status(httpStatus.OK).send(token);
});

const getPreferences = catchAsync(async (req, res) => {
  const preferences = await fcmService.getNotificationPreferences(req.query.user_id, {
    session_id: req.query.session_id,
  });

  res.status(httpStatus.OK).send({
    notification_preferences: preferences,
  });
});

const sendNotification = catchAsync(async (req, res) => {
  const result = await fcmService.sendNotification(
    req.body.user_id,
    req.body.title,
    req.body.body,
    req.body.data || {},
    { traceId: req.body.trace_id }
  );

  res.status(httpStatus.OK).send(result);
});

const getDebugLogs = catchAsync(async (req, res) => {
  const logs = await pushDeliveryLogService.findTraces({
    traceId: req.query.trace_id,
    userId: req.query.user_id,
    referenceId: req.query.reference_id,
    referenceType: req.query.reference_type,
    limit: req.query.limit,
  });
  res.status(httpStatus.OK).send({ data: logs });
});

const viewDebugLogs = catchAsync(async (req, res) => {
  const logs = await pushDeliveryLogService.findTraces({
    traceId: req.query.trace_id,
    userId: req.query.user_id,
    referenceId: req.query.reference_id,
    referenceType: req.query.reference_type,
    limit: req.query.limit,
  });

  const rows = logs.flatMap((log) => (log.events || []).map((event) => `
    <tr><td>${escapeHtml(event.created_at)}</td><td>${escapeHtml(log.trace_id)}</td><td>${escapeHtml(event.step)}</td><td>${escapeHtml(event.device_type || '-')}</td><td>${escapeHtml(event.status)}</td><td>${escapeHtml(event.message || '-')}</td></tr>`)).join('')
    || '<tr><td colspan="6">No delivery traces found in the last 12 hours.</td></tr>';

  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Push delivery logs</title><style>body{font-family:Arial;margin:24px;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}th{background:#f5f5f5}</style></head><body><h1>Push delivery logs</h1><p>Results are retained for 12 hours. Filter with trace_id, user_id, reference_id, or reference_type.</p><table><thead><tr><th>Time</th><th>Trace ID</th><th>Step</th><th>Device</th><th>Status</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
});

module.exports = {
  saveToken,
  removeToken,
  updatePreferences,
  getPreferences,
  sendNotification,
  getDebugLogs,
  viewDebugLogs,
};
