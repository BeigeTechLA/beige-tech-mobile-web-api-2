const httpStatus = require("http-status");
const tokenService = require("./token.service");
const userService = require("./user.service");
const Token = require("../models/token.model");
const ApiError = require("../utils/ApiError");
const { tokenTypes } = require("../config/tokens");
const monitoringService = require("./monitoring.service");

const config = require("../config/config");
const moment = require("moment");

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !(await user.isPasswordMatch(password))) {
    // Track failed login attempt
    monitoringService.trackAuthEvent('login_failed', { email, reason: 'invalid_credentials' });
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password");
  }

  // Track successful login
  monitoringService.trackAuthEvent('login_success', {
    userId: user.id,
    email: user.email,
    role: user.role,
    loginMethod: 'email_password'
  });

  // Set user context for error tracking
  monitoringService.setUserContext(user);

  return user;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({
    token: refreshToken,
    type: tokenTypes.REFRESH,
    blacklisted: false,
  });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, "Not found");
  }

  // Track logout event
  monitoringService.trackAuthEvent('logout', { userId: refreshTokenDoc.user });

  // Clear user context
  monitoringService.clearUserContext();

  await refreshTokenDoc.deleteOne();
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */

const refreshAuth = async (refreshToken) => {
  let refreshTokenDoc;
  try {
    // Verify the refresh token
    refreshTokenDoc = await tokenService.verifyToken(
      refreshToken,
      tokenTypes.REFRESH
    );

    // Fetch the user associated with the token
    const user = await userService.getUserById(refreshTokenDoc.user);

    if (!user) {
      // If the user doesn't exist, remove the token
      await refreshTokenDoc.deleteOne();
      throw new ApiError(httpStatus.UNAUTHORIZED, "User not found");
    }

    // Check if the refresh token has expired
    if (moment().isAfter(refreshTokenDoc.expires)) {
      await refreshTokenDoc.deleteOne();
      throw new ApiError(httpStatus.UNAUTHORIZED, "Refresh token expired");
    }

    // Generate a new access token
    const accessTokenExpires = moment().add(
      config.jwt.accessExpirationMinutes,
      "minutes"
    );
    const accessToken = await tokenService.generateToken(
      user.id,
      accessTokenExpires,
      tokenTypes.ACCESS
    );

    // Generate a new refresh token if necessary
    const refreshTokenExpires = moment(refreshTokenDoc.expires).toDate();
    let newRefreshToken = refreshToken;

    if (moment(refreshTokenExpires).isBefore(moment().add(1, "day"))) {
      // Delete old refresh token and issue a new one
      await refreshTokenDoc.deleteOne();
      const newRefreshTokenExpires = moment().add(
        config.jwt.refreshExpirationDays,
        "days"
      );
      newRefreshToken = await tokenService.generateToken(
        user.id,
        newRefreshTokenExpires,
        tokenTypes.REFRESH
      );
    }
    // Return the new tokens
    return {
      access: {
        token: accessToken,
        expires: accessTokenExpires.toDate(),
      },
      refresh: {
        token: newRefreshToken,
        expires: refreshTokenExpires,
      },
    };
  } catch (error) {
    // Handle errors and clean up expired tokens
    if (refreshTokenDoc) {
      await refreshTokenDoc.deleteOne();
    }
    throw new ApiError(httpStatus.UNAUTHORIZED, "Please login again");
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(
      resetPasswordToken,
      tokenTypes.RESET_PASSWORD
    );
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await userService.updateUserById(user.id, { password: newPassword });
    await Token.deleteMany({ user: user.id, type: tokenTypes.RESET_PASSWORD });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Password reset failed");
  }
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(
      verifyEmailToken,
      tokenTypes.VERIFY_EMAIL
    );
    const user = await userService.getUserById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user._id, type: tokenTypes.VERIFY_EMAIL });
    await userService.updateUserById(user._id, {
      isEmailVerified: true,
      // location: "N/A",
    });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Email verification failed");
  }
};

module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
};
