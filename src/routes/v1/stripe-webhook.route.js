const express = require("express");
const stripeController = require("../../controllers/stripe.controller");

const router = express.Router();

// CORS handling middleware specifically for webhook endpoint
// This handles CORS preflight and actual requests independently
router.use("/webhook", (req, res, next) => {
  // Set CORS headers for all webhook requests
  // Note: Actual Stripe webhooks won't have Origin header (server-to-server)
  // but browser-based testing tools will send Origin
  const origin = req.headers.origin;
  
  if (origin) {
    // If request has an Origin header, set CORS headers
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, stripe-signature, x-test-webhook"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  
  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  next();
});

// POST endpoint for actual webhook processing
// This route handles raw body parsing specifically for Stripe webhooks
router.post(
  "/webhook",
  express.raw({
    type: "application/json",
  }),
  stripeController.webhook
);

module.exports = router;
