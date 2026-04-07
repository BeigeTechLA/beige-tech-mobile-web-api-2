const Joi = require("joi");
const { password } = require("./custom.validation");

const register = {
  body: Joi.object().keys({
    role: Joi.string(),
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    location: Joi.string().required(),
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required(),
  }),
};

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const refreshTokens = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string(),
  }),
  body: Joi.object().keys({
    password: Joi.string().required().custom(password),
    token: Joi.string(),
  })
  .custom((value, helpers) => {
    // Either query token or body token must be provided
    const { token } = helpers.state.ancestors[0].query || {};
    if (!token && !value.token) {
      return helpers.error('any.required', { path: ['token'] });
    }
    return value;
  }),
};

const verifyEmail = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
};

const checkEmailExists = {
  query: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const sendOtp = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const verifyOtp = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
    otp: Joi.string().required().length(6),
  }),
};

const resendOtp = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyEmail,
  checkEmailExists,
  sendOtp,
  verifyOtp,
  resendOtp,
};
