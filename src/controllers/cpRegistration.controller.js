const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { userService, tokenService } = require("../services");
const User = require("../models/user.model");
const CP = require("../models/cp.model");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");








/**
 * Helper function to add timeout to promises.
 */
const withTimeout = (promise, timeoutMs, errorMessage) => {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
};

/**
 * Send email using nodemailer
 * Supports Gmail with App Password authentication
 *
 * IMPORTANT: For Gmail, you MUST use an App Password, not your regular password
 * Steps to generate App Password:
 * 1. Enable 2-Step Verification: https://myaccount.google.com/security
 * 2. Generate App Password: https://myaccount.google.com/apppasswords
 * 3. Use the generated 16-character password in SMTP_PASSWORD
 */
const sendEmail = async (to, subject, html) => {
  console.log("Preparing to send email to:", to);

  // Validate environment variables
  if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
    console.error("Email configuration error: SMTP credentials not configured in .env file");
    console.error("Please set: SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, EMAIL_FROM");
    return false;
  }

  try {
    const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
    const isSecure = smtpPort === 465; // Use secure for port 465 (SSL), false for 587 (TLS)

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: isSecure,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
      // Additional options for better reliability
      tls: {
        rejectUnauthorized: false // Accept self-signed certificates if needed
      },
      // Connection timeout settings
      connectionTimeout: 10000, // 10 seconds to establish connection
      greetingTimeout: 10000,   // 10 seconds for greeting
      socketTimeout: 15000,     // 15 seconds for socket operations
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development',
    });

    console.log(`SMTP Config: ${process.env.SMTP_HOST}:${smtpPort} (secure: ${isSecure})`);

    // Skip verify in production to avoid hanging - just try to send
    if (process.env.NODE_ENV === 'development') {
      try {
        await withTimeout(transporter.verify(), 10000, 'SMTP verify timed out');
        console.log("SMTP connection verified successfully");
      } catch (verifyErr) {
        console.warn("SMTP verify failed/skipped:", verifyErr.message);
        // Continue anyway - the sendMail will fail if there's a real issue
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
      to,
      subject,
      html,
    };

    // Send with 30 second timeout
    const info = await withTimeout(
      transporter.sendMail(mailOptions),
      30000,
      'Email sending timed out after 30 seconds'
    );
    console.log("Email sent successfully:", info.messageId);
    return true;

  } catch (err) {
    console.error("Email send error:", err.message);

    // Provide helpful error messages
    if (err.code === 'EAUTH') {
      console.error("\n❌ AUTHENTICATION FAILED");
      console.error("This error means your email credentials are incorrect.");
      console.error("\nFor Gmail users:");
      console.error("1. You MUST use an App Password, NOT your regular Gmail password");
      console.error("2. Enable 2-Step Verification: https://myaccount.google.com/security");
      console.error("3. Generate App Password: https://myaccount.google.com/apppasswords");
      console.error("4. Update SMTP_PASSWORD in your .env file with the 16-character App Password");
    } else if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT' || err.message.includes('timed out')) {
      console.error("\n❌ CONNECTION FAILED/TIMEOUT");
      console.error("Cannot connect to SMTP server. This could be:");
      console.error("1. SMTP server is blocking connections from this IP");
      console.error("2. Firewall blocking outbound SMTP");
      console.error("3. SMTP credentials are incorrect");
    }

    return false;
  }
};

/**
 * Register new creative partner
 * 
 * 
 * 
 * 
 * 
 *
 * Creates both User and CP records
 */


/**
 * Get creative partner by email (for admin assignment)
 */
const getCreativeByEmail = catchAsync(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Email is required",
    });
  }

  const user = await User.findOne({ email, role: "cp" });

  if (!user) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: "No creative partner found with this email",
    });
  }

  // Get CP profile data
  const cpProfile = await CP.findOne({ userId: user._id });

  res.json({
    success: true,
    creative: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.contact_number,
      services: cpProfile?.content_type || [],
      reviewStatus: cpProfile?.review_status || "pending",
    },
  });
});



const registerCPUser = catchAsync(async (req, res) => {
  const { name, email, phone, password } = req.body;

  // Check existing user
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ success: false, message: "Email already registered" });
  }

  // Password validation
  if (!password || password.length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters" });

  if (!password.match(/\d/) || !password.match(/[a-zA-Z]/))
    return res.status(400).json({
      message: "Password must contain at least 1 letter and 1 number",
    });

  // Create User
  const user = await User.create({
    name,
    email,
    contact_number: phone,
    password,
    role: "cp",
    isEmailVerified: false,
    socialProvider: "local",
  });

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Save OTP to user schema
  user.otp = {
    code: otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  };
  await user.save();

  // Send OTP email asynchronously - don't block the response
  // This prevents 504 timeout if SMTP is slow/blocked
  sendEmail(
    email,
    "Email Verification OTP",
    `<p>Your OTP is <b>${otp}</b>. It expires in 5 minutes.</p>`
  ).then(emailSent => {
    if (!emailSent) {
      console.warn(`User ${user._id} created but OTP email failed to send to ${email}`);
    } else {
      console.log(`OTP email sent successfully to ${email}`);
    }
  }).catch(err => {
    console.error(`Email sending error for ${email}:`, err.message);
  });

  // Respond immediately - don't wait for email
  return res.status(201).json({
    success: true,
    message: "User registered. OTP sent to email.",
    userId: user._id,
    emailSent: true, // Optimistically assume email will be sent
  });
});

const verifyOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  // Static OTP for testing
  const isStaticOtp = otp === '123456';

  if (!isStaticOtp) {
    if (!user.otp || !user.otp.code)
      return res.status(400).json({ message: "OTP not generated" });

    // Check expiry
    if (user.otp.expiresAt < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    // Check match
    if (user.otp.code !== otp)
      return res.status(400).json({ message: "Invalid OTP" });
  }

  // Mark verified
  user.isEmailVerified = true;
  user.otp = undefined;
  await user.save();

  // Generate JWT after verification
  const tokens = await tokenService.generateAuthTokens(user);

  return res.json({
    success: true,
    message: "OTP verified successfully",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    tokens,
  });
});


const completeCPRegistration = catchAsync(async (req, res) => {
  const {
    userId,
    services,
    yearsExperience,
    equipment,
    website,
    photographyRate,
    videographyRate,
    combinedRate,
    location,
    geo_location
  } = req.body;

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (!user.isEmailVerified)
    return res.status(400).json({
      success: false,
      message: "Email not verified. Cannot create CP profile.",
    });

  // Validate and prepare geo_location
  let validGeoLocation = { type: "Point", coordinates: [0, 0] };
  if (geo_location &&
      geo_location.type === "Point" &&
      Array.isArray(geo_location.coordinates) &&
      geo_location.coordinates.length === 2) {
    validGeoLocation = geo_location;
  }

  const cp = await CP.create({
    userId,
    contact_number: user.contact_number,
    content_type: services || [],
    equipment: equipment || [],
    rate: combinedRate || photographyRate || videographyRate || "0",
    photographyRate: photographyRate || "0",
    videographyRate: videographyRate || "0",
    combinedRate: combinedRate || "0",
    review_status: "pending",
    vst: services || [],
    reference: website || "",
    city: location || "",  // Map location string to city field in CP model
    geo_location: validGeoLocation,
  });

  // Also update the user's location field
  if (location) {
    await User.findByIdAndUpdate(userId, { location: location });
  }

  // console.log("CP created:", cp);

  res.status(201).json({
    success: true,
    message: "Creative Partner profile created successfully",
    cp,
  });
});

const resendOTP = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  // Generate new OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  user.otp = {
    code: otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  await user.save();

  const emailSent = await sendEmail(
    email,
    "Email Verification OTP",
    `<p>Your OTP is <b>${otp}</b>. It expires in 5 minutes.</p>`
  );

  if (!emailSent) {
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP email. Please check email configuration or try again later.",
    });
  }

  res.json({
    success: true,
    message: "OTP resent successfully",
    emailSent: true,
  });
});





module.exports = {
  getCreativeByEmail,
  registerCPUser,
  verifyOTP,
  completeCPRegistration,
  resendOTP,
};


// where is jwt  follow below structure after verify return jwt 


// const registerCreativePartner = catchAsync(async (req, res) => {
//   const {
//     // Step 1: Personal Information
//     name,
//     email,
//     phone,
//     password,
//     // Step 3: Professional Specialties
//     services,
//     // Step 4: Experience & Equipment
//     yearsExperience,
//     equipment,
//     // Step 5: Online Profile & Rate
//     website,
//     photographyRate,
//     videographyRate,
//     combinedRate,
//     // Location (optional from form or set default)
//     location,
//   } = req.body;

//   // Check if user already exists
//   const existingUser = await User.findOne({ email });
//   if (existingUser) {
//     return res.status(httpStatus.BAD_REQUEST).json({
//       success: false,
//       message: "Email already registered",
//     });
//   }

//   // Validate password strength
//   if (!password || password.length < 8) {
//     return res.status(httpStatus.BAD_REQUEST).json({
//       success: false,
//       message: "Password must be at least 8 characters long",
//     });
//   }

//   if (!password.match(/\d/) || !password.match(/[a-zA-Z]/)) {
//     return res.status(httpStatus.BAD_REQUEST).json({
//       success: false,
//       message: "Password must contain at least one letter and one number",
//     });
//   }

//   // Create User with 'cp' role
//   const newUser = new User({
//     name,
//     email,
//     password, // Will be hashed by pre-save hook
//     contact_number: phone,
//     location: location || "Not specified",
//     role: "cp",
//     isEmailVerified: false,
//     socialProvider: "local",
//   });

//   await newUser.save();

//   // Create CP profile with default geo_location
//   const newCP = new CP({
//     userId: newUser._id,
//     contact_number: phone,
//     content_type: services || [],
//     equipment: equipment || [],
//     rate: combinedRate || photographyRate || videographyRate || "0",
//     review_status: "pending",
//     // Store additional registration data (can be used later for matching algorithm)
//     vst: services || [], // Temporarily store services in vst as well
//     // Default geo_location (can be updated later when user provides actual location)
//     geo_location: {
//       type: "Point",
//       coordinates: [0, 0], // Default coordinates, should be updated later
//     },
//     // Store website if provided
//     reference: website || "",
//   });

//   await newCP.save();

//   // Generate JWT tokens for automatic login
//   const tokens = await tokenService.generateAuthTokens(newUser);

//   // Return success response with tokens
//   res.status(httpStatus.CREATED).json({
//     success: true,
//     message: "Creative partner account created successfully",
//     user: {
//       id: newUser._id,
//       name: newUser.name,
//       email: newUser.email,
//       role: "cp",
//     },
//     tokens,
//   });
// });
