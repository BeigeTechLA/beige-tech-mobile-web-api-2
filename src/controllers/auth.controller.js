const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const {
  authService,
  userService,
  tokenService,
  emailService,
} = require("../services");
const sendgridService = require("../services/sendgrid.service");

const register = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await userService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  await sendVerificationEmail_r(email);
  res.status(httpStatus.CREATED).send({ user, tokens });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    // If token not found, still return success
    if (error.statusCode === httpStatus.NOT_FOUND) {
      return res.status(httpStatus.NO_CONTENT).send();
    }
    throw error;
  }
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  try {
    // Generate reset token (this will throw error if user doesn't exist)
    const resetPasswordToken = await tokenService.generateResetPasswordToken(
      req.body.email
    );

    // Send reset email via SendGrid
    await sendgridService.sendResetPasswordEmail(req.body.email, resetPasswordToken);

    res.status(httpStatus.OK).send({
      success: true,
      message: "Password reset instructions have been sent to your email."
    });
  } catch (error) {
    // Return generic success message even on error (security best practice)
    // This prevents email enumeration attacks
    res.status(httpStatus.OK).send({
      success: true,
      message: "If an account exists with this email, password reset instructions have been sent."
    });
  }
});

const resetPassword = catchAsync(async (req, res) => {
  // Get token from query parameter or request body
  const token = req.query.token || req.body.token;
  
  if (!token) {
    return res.status(httpStatus.BAD_REQUEST).send({ 
      code: httpStatus.BAD_REQUEST,
      message: 'Token is required'
    });
  }
  
  await authService.resetPassword(token, req.body.password);
  res.status(httpStatus.OK).send({ 
    success: true,
    message: 'Password reset successfully'
  });
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(
    req.user
  );
  await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendVerificationEmail_r = catchAsync(async (email) => {
  const user = await userService.getUserByEmail(email);
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(user);
  await emailService.sendVerificationEmail(email, verifyEmailToken);
});

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  res.status(httpStatus.NO_CONTENT).send();
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  // Validate that current password and new password are provided
  if (!currentPassword || !newPassword) {
    return res.status(httpStatus.BAD_REQUEST).send({
      code: httpStatus.BAD_REQUEST,
      message: 'Current password and new password are required'
    });
  }

  // Validate that new password is different from current password
  if (currentPassword === newPassword) {
    return res.status(httpStatus.BAD_REQUEST).send({
      code: httpStatus.BAD_REQUEST,
      message: 'New password must be different from current password'
    });
  }

  // Get user and verify current password
  const user = await userService.getUserById(userId);
  if (!user) {
    return res.status(httpStatus.NOT_FOUND).send({
      code: httpStatus.NOT_FOUND,
      message: 'User not found'
    });
  }

  // Verify current password
  const isPasswordMatch = await user.isPasswordMatch(currentPassword);
  if (!isPasswordMatch) {
    return res.status(httpStatus.UNAUTHORIZED).send({
      code: httpStatus.UNAUTHORIZED,
      message: 'Current password is incorrect'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Password changed successfully'
  });
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  changePassword,
};
