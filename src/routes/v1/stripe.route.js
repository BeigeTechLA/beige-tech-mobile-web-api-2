const express = require('express');
const auth = require('../../middlewares/auth');
const { authenticateOptional } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const stripeValidation = require('../../validations/stripe.validation');
const stripeController = require('../../controllers/stripe.controller');

const router = express.Router();

// Create checkout session
router
  .route('/create-checkout-session')
  .post(validate(stripeValidation.createCheckoutSession), stripeController.createCheckoutSession);

// Create payment intent for custom checkout
router
  .route('/create-payment-intent')
  .post(
    authenticateOptional(), // Optional authentication - supports both guest and authenticated users
    validate(stripeValidation.createPaymentIntent),
    stripeController.createPaymentIntent
  );

// Confirm payment intent
router
  .route('/confirm-payment')
  .post(
    authenticateOptional(), // Optional authentication - supports both guest and authenticated users
    validate(stripeValidation.confirmPayment),
    stripeController.confirmPayment
  );

// Get session details
router
  .route('/session/:sessionId')
  .get(stripeController.getSession);

// Stripe webhook is now handled by a separate route before body parsing middleware
// See /v1/stripe/webhook in stripe-webhook.route.js

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Stripe
 *   description: Stripe payment processing endpoints
 */

/**
 * @swagger
 * /stripe/create-checkout-session:
 *   post:
 *     summary: Create a Stripe checkout session
 *     description: Create a Stripe checkout session for booking payment
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contentType
 *               - startDateTime
 *               - durationHours
 *               - shootType
 *             properties:
 *               contentType:
 *                 type: string
 *                 enum: [videography, photography, both]
 *               startDateTime:
 *                 type: string
 *                 format: date-time
 *               durationHours:
 *                 type: number
 *                 minimum: 2
 *               location:
 *                 type: string
 *               needStudio:
 *                 type: boolean
 *               shootType:
 *                 type: string
 *               editType:
 *                 type: string
 *             example:
 *               contentType: "photography"
 *               startDateTime: "2025-02-01T10:00:00.000Z"
 *               durationHours: 4
 *               location: "Los Angeles, CA"
 *               needStudio: false
 *               shootType: "Brand Campaign"
 *               editType: "Basic Color Correction"
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                     url:
 *                       type: string
 */

/**
 * @swagger
 * /stripe/create-payment-intent:
 *   post:
 *     summary: Create a payment intent
 *     description: Create a payment intent for custom checkout flow
 *     tags: [Stripe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contentType
 *               - startDateTime
 *               - durationHours
 *               - shootType
 *             properties:
 *               contentType:
 *                 type: string
 *                 enum: [videography, photography, both]
 *               startDateTime:
 *                 type: string
 *                 format: date-time
 *               durationHours:
 *                 type: number
 *                 minimum: 2
 *               location:
 *                 type: string
 *               needStudio:
 *                 type: boolean
 *               shootType:
 *                 type: string
 *               editType:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     clientSecret:
 *                       type: string
 *                     paymentIntentId:
 *                       type: string
 */

/**
 * @swagger
 * /stripe/webhook:
 *   post:
 *     summary: Stripe webhook endpoint
 *     description: Handle Stripe webhook events
 *     tags: [Stripe]
 *     responses:
 *       "200":
 *         description: OK
 */