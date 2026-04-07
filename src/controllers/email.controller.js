const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { userService, otpService } = require('../services');

/**
 * Check if an email exists in the database
 * @route GET /api/v1/auth/check-email
 */
const checkEmailExists = catchAsync(async (req, res) => {
  const { email } = req.query;
  const exists = await userService.checkEmailExists(email);
  res.status(httpStatus.OK).send({ exists });
});

/**
 * Send OTP for email verification
 * @route POST /api/v1/auth/send-otp
 */
const sendOtp = catchAsync(async (req, res) => {
  const { email } = req.body;
  
  // Check if user exists
  const user = await userService.getUserByEmail(email);
  if (!user) {
    return res.status(httpStatus.NOT_FOUND).send({
      code: httpStatus.NOT_FOUND,
      message: 'User not found with this email'
    });
  }
  
  // Generate and store OTP
  const otpDoc = await otpService.createOTP(email);
  
  // Send OTP via email
  await otpService.sendOTPEmail(email, otpDoc.otp);
  
  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP sent successfully',
    expiresAt: otpDoc.expiresAt
  });
});

/**
 * Verify OTP for email verification
 * @route POST /api/v1/auth/verify-otp
 */
const verifyOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  
  // Verify OTP
  await otpService.verifyOTP(email, otp);
  
  // Update user's email verification status
  const user = await userService.getUserByEmail(email);
  if (user) {
    await userService.updateUserById(user.id, { isEmailVerified: true });
  }
  
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Email verified successfully'
  });
});

/**
 * Resend OTP for email verification
 * @route POST /api/v1/auth/resend-otp
 */
const resendOtp = catchAsync(async (req, res) => {
  const { email } = req.body;
  
  // Check if user exists
  const user = await userService.getUserByEmail(email);
  if (!user) {
    return res.status(httpStatus.NOT_FOUND).send({
      code: httpStatus.NOT_FOUND,
      message: 'User not found with this email'
    });
  }
  
  // Check if there's an active OTP
  const hasActiveOtp = await otpService.hasActiveOTP(email);
  
  // Generate and store new OTP
  const otpDoc = await otpService.createOTP(email);
  
  // Send OTP via email
  await otpService.sendOTPEmail(email, otpDoc.otp);
  
  res.status(httpStatus.OK).send({
    success: true,
    message: hasActiveOtp ? 'New OTP sent successfully' : 'OTP sent successfully',
    expiresAt: otpDoc.expiresAt
  });
});

module.exports = {
  checkEmailExists,
  sendOtp,
  verifyOtp,
  resendOtp,
};
