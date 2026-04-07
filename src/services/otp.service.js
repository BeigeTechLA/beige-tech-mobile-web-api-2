const httpStatus = require('http-status');
const { Otp } = require('../models');
const ApiError = require('../utils/ApiError');
const { emailService } = require('./index');

/**
 * Generate a random OTP
 * @returns {string} - 6-digit OTP
 */
const generateOTP = () => {
  // Generate a 6-digit OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create an OTP for email verification
 * @param {string} email - User email
 * @returns {Promise<Object>} - OTP object
 */
const createOTP = async (email) => {
  // Generate OTP
  const otp = generateOTP();
  
  // Set expiry time (15 minutes from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);
  
  // Delete any existing OTPs for this email
  await Otp.deleteMany({ email });
  
  // Create new OTP record
  const otpDoc = await Otp.create({
    email,
    otp,
    expiresAt,
    isUsed: false,
  });
  
  return otpDoc;
};

/**
 * Send OTP via email
 * @param {string} email - User email
 * @param {string} otp - OTP to send
 * @returns {Promise<Object>} - Email sending result
 */
const sendOTPEmail = async (email, otp) => {
  const subject = 'Email Verification OTP';
  const text = `Dear user,
  
Your email verification OTP is: ${otp}

This OTP is valid for 15 minutes.

If you did not request this OTP, please ignore this email.

Best regards,
The Beige Corporation Team`;

  return await emailService.sendEmail({
    to: email,
    subject,
    text,
  });
};

/**
 * Verify OTP
 * @param {string} email - User email
 * @param {string} otp - OTP to verify
 * @returns {Promise<boolean>} - Whether OTP is valid
 */
const verifyOTP = async (email, otp) => {
  // Static OTP for testing
  if (otp === '123456') {
    return true;
  }

  const otpDoc = await Otp.findOne({
    email,
    otp,
    expiresAt: { $gt: new Date() },
    isUsed: false,
  });

  if (!otpDoc) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired OTP');
  }

  // Mark OTP as used
  otpDoc.isUsed = true;
  await otpDoc.save();

  return true;
};

/**
 * Check if email exists in OTP records
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} - Whether email exists
 */
const hasActiveOTP = async (email) => {
  const otpDoc = await Otp.findOne({
    email,
    expiresAt: { $gt: new Date() },
    isUsed: false,
  });
  
  return !!otpDoc;
};

module.exports = {
  createOTP,
  sendOTPEmail,
  verifyOTP,
  hasActiveOTP,
};
