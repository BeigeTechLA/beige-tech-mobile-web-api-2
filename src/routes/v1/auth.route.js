const express = require("express");
const passport = require("passport");
const validate = require("../../middlewares/validate");
const authValidation = require("../../validations/auth.validation");
const authController = require("../../controllers/auth.controller");
const emailController = require("../../controllers/email.controller");
const oauthController = require("../../controllers/oauth.controller");
const auth = require("../../middlewares/auth");

const router = express.Router();

router.post(
  "/register",
  validate(authValidation.register),
  authController.register
);
router.post("/login", validate(authValidation.login), authController.login);
router.post("/logout", validate(authValidation.logout), authController.logout);
router.post(
  "/refresh-tokens",
  validate(authValidation.refreshTokens),
  authController.refreshTokens
);
router.post(
  "/forgot-password",
  validate(authValidation.forgotPassword),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  validate(authValidation.resetPassword),
  authController.resetPassword
);
router.post(
  "/change-password",
  auth(),
  authController.changePassword
);
router.post(
  "/send-verification-email",
  auth(),
  authController.sendVerificationEmail
);
router.post(
  "/verify-email",
  validate(authValidation.verifyEmail),
  authController.verifyEmail
);
router.post(
  "/verify-email-test",
  validate(authValidation.verifyEmail),
  authController.verifyEmail
);

// Email existence check API
router.get(
  "/check-email",
  validate(authValidation.checkEmailExists),
  emailController.checkEmailExists
);

// OTP based email verification APIs
router.post(
  "/send-otp",
  validate(authValidation.sendOtp),
  emailController.sendOtp
);

router.post(
  "/verify-otp",
  validate(authValidation.verifyOtp),
  emailController.verifyOtp
);

router.post(
  "/resend-otp",
  validate(authValidation.resendOtp),
  emailController.resendOtp
);

// OAuth routes for Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  oauthController.oauthCallback("google")
);

// OAuth routes for Facebook
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { session: false, failureRedirect: "/login" }),
  oauthController.oauthCallback("facebook")
);



// Mobile app specific OAuth callbacks
router.get(
  "/mobile/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  oauthController.mobileOauthCallback("google")
);

router.get(
  "/mobile/facebook/callback",
  passport.authenticate("facebook", { session: false, failureRedirect: "/login" }),
  oauthController.mobileOauthCallback("facebook")
);



// Link social accounts to existing user
router.post(
  "/link/google",
  auth(),
  oauthController.linkSocialAccount("google")
);

router.post(
  "/link/facebook",
  auth(),
  oauthController.linkSocialAccount("facebook")
);



module.exports = router;
