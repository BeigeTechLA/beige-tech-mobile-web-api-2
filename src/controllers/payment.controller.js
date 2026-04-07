const httpStatus = require("http-status");
const pick = require("../utils/pick");
const catchAsync = require("../utils/catchAsync");
const { paymentService, orderService } = require("../services");
const config = require("../config/config");
const logger = require("../config/logger");
const stripe = require("stripe")(config.stripe.secretKey);

/**
 * Get payment data by ID.
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @returns {Promise<void>} - Returns a promise that resolves to the JSON response containing the payment data.
 */
const getPaymentById = catchAsync(async (req, res) => {
  const result = await paymentService.getPaymentData(req.params.id);
  res.json(result);
});
// Create payment intent
const createPaymentIntent = async (req, res) => {
  //   const intentConfig = req.body;
  const orderId = req.params.id;
  const { id, shoot_cost, order_name } = await orderService.getOrderById(
    orderId
  );
  const intentConfig = {
    amount: shoot_cost,
    currency: "USD",
    description: order_name,
    metadata: {
      order_id: id,
    },
  };
  const intent = await paymentService.createPaymentIntent(intentConfig);
  res.json(intent);
};
/**
 * Get payment intent data by ID.
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @returns {Promise<void>} - Returns a promise that resolves to the JSON response containing the payment intent data.
 */
const getPaymentIntentById = catchAsync(async (req, res) => {
  const result = await paymentService.getPaymentIntentData(req.params.id);
  res.json(result);
});

/**
 * Retrieve the client secret for a payment intent associated with an order ID.
 *
 * This endpoint fetches the payment intent client secret for a specified order ID.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {Object} - The payment intent client secret.
 * @throws {ApiError} - If there are errors with processing the request.
 */
const getClientSecretByOrderId = catchAsync(async (req, res) => {
  // Fetch order id from request parameters
  const orderId = req.params.order_id;

  // Process order id checking and fetch order data
  const orderData = await orderService.checkOrderId(orderId, true);

  // Create and fetch the payment intent client secret against the order
  const result = await paymentService.getClientSecretByOrderId(
    orderData,
    req.query.amount
  );

  res.json(result);
});

/**
 * Handle Stripe webhook events for payment processing.
 *
 * @param {Object} request - The HTTP request object.
 * @param {Object} response - The HTTP response object.
 * @throws {Error} If an error occurs while constructing the event or updating the payment status.
 * @returns {void}
 */
const handleWebHook = catchAsync(async (request, response) => {
  const endpointSecret = config.stripe.endpointSecret;
  const signature = request.headers["stripe-signature"];
  const requestBody = request.body;

  let event = null;

  try {
    event = stripe.webhooks.constructEvent(
      requestBody,
      signature,
      endpointSecret
    );
  } catch (err) {
    logger.error(`WEBHOOK PAYMENT STATUS UPDATE ERROR: ${err.message}`);
    response.status(httpStatus.BAD_REQUEST).end();
    return;
  }

  const statuses = [
    "payment_intent.processing",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
  ];

  const eventType = event["type"];
  const intent = event.data.object;

  if (statuses.includes(eventType)) {
    const intentId = intent.id;
    const paymentStatus = eventType.split(".")[1];
    await paymentService.updatePaymentStatus(intentId, paymentStatus);
  }

  response.sendStatus(httpStatus.OK);
});

module.exports = {
  getClientSecretByOrderId,
  getPaymentById,
  getPaymentIntentById,
  handleWebHook,
  createPaymentIntent,
};
