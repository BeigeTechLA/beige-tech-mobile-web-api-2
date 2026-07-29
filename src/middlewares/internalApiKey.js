const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const internalApiKey = (req, res, next) => {
  const configuredKey = process.env.PUSH_NOTIFICATION_INTERNAL_API_KEY;
  const providedKey = req.headers['x-internal-api-key'];

  if (!configuredKey) {
    return next(new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Internal push API key is not configured'));
  }

  if (!providedKey || providedKey !== configuredKey) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Invalid internal API key'));
  }

  return next();
};

module.exports = internalApiKey;
