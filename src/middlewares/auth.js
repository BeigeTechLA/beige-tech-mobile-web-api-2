const passport = require('passport');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { roleRights } = require('../config/roles');

const verifyCallback = (req, resolve, reject, requiredRights) => async (err, user, info) => {
  if (err || info || !user) {
    // Provide more specific error messages
    let errorMessage = 'Please authenticate';
    if (info && info.message) {
      if (info.message.includes('expired')) {
        errorMessage = 'Token has expired';
      } else if (info.message.includes('invalid')) {
        errorMessage = 'Invalid token';
      } else if (info.message.includes('malformed')) {
        errorMessage = 'Malformed token';
      }
    } else if (!req.headers.authorization) {
      errorMessage = 'Authorization header is required';
    }
    return reject(new ApiError(httpStatus.UNAUTHORIZED, errorMessage));
  }

  // Check if user is still active
  // if (!user.isEmailVerified) {
  //   return reject(new ApiError(httpStatus.UNAUTHORIZED, 'Please verify your email first'));
  // }

  req.user = user;

  if (requiredRights.length) {
    const userRights = roleRights.get(user.role);
    if (!userRights) {
      return reject(new ApiError(httpStatus.FORBIDDEN, 'Invalid user role'));
    }
    const hasRequiredRights = requiredRights.every((requiredRight) => userRights.includes(requiredRight));
    if (!hasRequiredRights && req.params.userId !== user.id) {
      return reject(new ApiError(httpStatus.FORBIDDEN, 'Insufficient permissions'));
    }
  }

  resolve();
};

const auth =
  (...requiredRights) =>
  async (req, res, next) => {
    return new Promise((resolve, reject) => {
      passport.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject, requiredRights))(req, res, next);
    })
      .then(() => next())
      .catch((err) => next(err));
  };

/**
 * Optional authentication callback - does not throw errors if no token is provided
 * @param {Object} req - Express request object
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 * @param {Array} requiredRights - Array of required rights
 * @returns {Function} Callback function
 */
const verifyOptionalCallback = (req, resolve, reject, requiredRights) => async (err, user, info) => {
  // If no authorization header is provided, continue without setting user
  if (!req.headers.authorization) {
    req.user = null;
    return resolve();
  }

  // If there's an error or the token is invalid, continue without user
  if (err || info || !user) {
    req.user = null;
    return resolve();
  }

  // If user is found, set it on the request
  req.user = user;

  // Check required rights only if user is authenticated and rights are specified
  if (requiredRights.length && user) {
    const userRights = roleRights.get(user.role);
    if (!userRights) {
      req.user = null; // Remove user if role is invalid
      return resolve();
    }
    const hasRequiredRights = requiredRights.every((requiredRight) => userRights.includes(requiredRight));
    if (!hasRequiredRights && req.params.userId !== user.id) {
      req.user = null; // Remove user if insufficient rights
      return resolve();
    }
  }

  resolve();
};

/**
 * Optional authentication middleware - allows both authenticated and guest access
 * Sets req.user if valid token is provided, otherwise sets req.user to null
 * @param {...string} requiredRights - Required rights (optional)
 * @returns {Function} Express middleware function
 */
const authenticateOptional =
  (...requiredRights) =>
  async (req, res, next) => {
    return new Promise((resolve, reject) => {
      passport.authenticate('jwt', { session: false }, verifyOptionalCallback(req, resolve, reject, requiredRights))(req, res, next);
    })
      .then(() => next())
      .catch((err) => {
        // Log the error but don't fail the request
        console.warn('Optional authentication failed:', err.message);
        req.user = null;
        next();
      });
  };

module.exports = auth;
module.exports.authenticateOptional = authenticateOptional;
