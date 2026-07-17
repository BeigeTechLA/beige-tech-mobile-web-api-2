const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { fcmService } = require('../services');

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

const sendNotification = catchAsync(async (req, res) => {
  const sent = await fcmService.sendNotification(
    req.body.user_id,
    req.body.title,
    req.body.body,
    req.body.data || {}
  );

  res.status(httpStatus.OK).send({
    success: sent,
  });
});

module.exports = {
  saveToken,
  removeToken,
  sendNotification,
};
