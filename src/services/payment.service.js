const mongoose = require("mongoose");
const httpStatus = require("http-status");
const { Payment, Order } = require("../models");
const config = require("../config/config");
const stripe = require("stripe")(config.stripe.secretKey);
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");
// Avoid circular dependency by importing directly
const orderService = require("./order.service");

const returnWarningMessage = (message) => {
  logger.warn(`WARNING: ${message}`);
  return {
    message: message,
  };
};

/**
 * Create a payment intent and save data to the payment collection.
 * @param {object} intentConfig - Configuration object for payment intent.
 * @returns {Promise<object|boolean>} The created payment object with additional data if successful,
 * or `false` if an error occurs.
 *
 * Example of intentConfig
 * {
 *     amount: 100.00,
 *     currency:"USD",
 *     description:"VPS hosting for 4 month",
 *     metadata:{
 *         order_id:"6467"
 *     }
 * }
 */
const createPaymentIntent = async (intentConfig) => {
  try {
    const { amount, currency, description } = intentConfig;

    const paymentIntent = await stripe.paymentIntents.create(intentConfig);

    // Save data to payment collection
    return await Payment.create({
      intent_id: paymentIntent.id,
      amount: amount,
      currency: currency,
      client_secret: paymentIntent.client_secret,
      description: description,
      status: paymentIntent.status,
    });
  } catch (error) {
    // Log the error and return false
    logger.error(`ERROR: ${error.message}`);
    return false;
  }
};

/**
 * Retrieve the client secret for a payment intent associated with an order.
 *
 * This function fetches the payment intent client secret for a given order and amount.
 *
 * @param {Object} orderData - The order data object.
 * @param {number} amount - The requested payment amount.
 * @returns {Object} - The payment intent client secret.
 * @throws {ApiError} - If there are errors with processing the payment request.
 */
const getClientSecretByOrderId = async (orderData, amount) => {
  const paymentData = orderData.payment;

  // Throw an error if the order payment status is paid
  if (paymentData.payment_status === "paid") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot generate a payment client secret for an order that has already been paid"
    );
  }

  // Count number of payments associated with the current order
  const paymentsCount = Number(paymentData.payment_ids.length);

  // Set initial target amount for the payment intent
  let intentAmount = paymentData.amount_remaining;

  // Process if order payment type is partial payment
  if (paymentData.payment_type === "partial") {
    // Check if payment intent is requested for initial partial payment
    if (paymentData.payment_status === "pending") {
      //Throw an error if preferred payment amount is not supplied for initial partial payment
      if (typeof amount === "undefined") {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Amount is required for initial partial payment"
        );
      }

      // Throw an error if initial partial payment is less than 50% of the total amount
      if (amount < intentAmount / 2) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Initial partial payment amount cannot be less than 50% of the total amount"
        );
      }

      // Throw an error if there is already an initial partial payment intent created
      if (paymentsCount > 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Initial partial payment intent is already created. Please charge the initial payment intent first"
        );
      }

      // Set the intentAmount to the client desired amount
      intentAmount = amount;
    } else {
      // Check if payment intent is requested for final partial payment
      if (paymentsCount > 1) {
        // Throw an error if final partial payment intent is already created
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Final partial payment intent is already created. Please charge the final partial payment intent"
        );
      }
    }
  }

  // Process if order payment type is full payment
  if (paymentData.payment_type === "full") {
    if (paymentsCount > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "A payment intent is already created for the order. Please charge the created payment intent!"
      );
    }
  }

  const orderId = orderData._id;

  // Create payment using order id
  const paymentRecord = await createPaymentIntent({
    amount: intentAmount,
    currency: "USD",
    description: orderData.order_name,
    metadata: {
      order_id: `${orderId}`,
    },
  });

  // Update order data payment ID
  orderData.payment.payment_ids.push(paymentRecord._id);
  await orderData.save();

  return paymentRecord;
};

/**
 * Get payment data by ID from the payment collection.
 * @param {string} paymentId - The ID of the payment.
 * @returns {Promise<object|boolean>} The payment object if found, or `false` if an error occurs.
 */
const getPaymentData = async (paymentId) => {
  try {
    return await Payment.findById(paymentId);
  } catch (error) {
    // Log the error and return false
    logger.error(`ERROR: ${error.message}`);
    return false;
  }
};

/**
 * Get payment intent data by ID from Stripe.
 * @param {string} paymentIntentId - The ID of the payment intent.
 * @returns {Promise<object|boolean>} The payment intent object if found, or `false` if an error occurs.
 */
const getPaymentIntentData = async (paymentIntentId) => {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    // Log the error and return false
    logger.error(`ERROR: ${error.message}`);
    return false;
  }
};

/**
 * Update payment data and payment intent data.
 * @param {string} paymentId - The ID of the payment.
 * @param {object} updateObject - Object containing updated payment data.
 * @returns {Promise<object|boolean>} The updated payment object if successful,
 * or `false` if an error occurs.
 *
 * Example of updateObject
 * {
 *     amount: 100.00,
 *     currency: "USD",
 *     description: "VPS hosting for 4 months"
 * }
 *
 */
const updatePaymentData = async (paymentId, updateObject) => {
  try {
    //Fetch current payment data
    const paymentData = await Payment.findById(paymentId);

    //check if payment status is not succeeded
    if (paymentData.status !== "succeeded") {
      //Process database update
      const updatedPayment = await Payment.findByIdAndUpdate(
        paymentId,
        updateObject,
        { new: true }
      ).exec();

      // Check if the update was successful
      if (updatedPayment) {
        // Proceed with payment intent update
        const updatedPaymentIntent = await stripe.paymentIntents.update(
          updatedPayment.intent_id,
          updateObject
        );

        if (updatedPaymentIntent) {
          return updatedPayment;
        }

        //Process if payment intent data update fails
        returnWarningMessage("Failed to update payment intent data");
      }

      //Process if payment data update fails
      returnWarningMessage("Failed to update payment data");
    }

    //Process if payment status is 'succeeded'
    returnWarningMessage("Payment with succeeded status cannot be updated");
  } catch (error) {
    // Log the error and return false
    logger.error(`ERROR: ${error.message}`);
    return false;
  }
};

/**
 * Update the payment status for a given intent ID.
 *
 * @param {string} intentId - The ID of the payment intent.
 * @param {string} paymentStatus - The new payment status.
 * @throws {Error} If an error occurs while updating the payment status.
 * @returns {Promise<void>}
 */
const updatePaymentStatus = async (intentId, paymentStatus) => {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      //fetch the payment record
      const paymentRecord = await Payment.findOne({
        intent_id: intentId,
      });
      const paymentId = paymentRecord._id;

      //Update the payment status in the payment record
      paymentRecord.status = paymentStatus;
      paymentRecord.save();

      //fetch the order record using the payment record
      const orderRecord = await Order.findOne({
        "payment.payment_ids": paymentId,
      });

      //Update order record payment associated fields
      const orderPaymentData = orderRecord.payment;

      //Prepare and update order payment amount_paid and amount_remaining fields
      const amountPaid = orderPaymentData.amount_paid + paymentRecord.amount;
      const amountRemaining =
        orderPaymentData.amount_remaining - paymentRecord.amount;

      orderRecord.payment.amount_paid = amountPaid;
      orderRecord.payment.amount_remaining = amountRemaining;

      //Prepare and update order payment payment_status field
      if (orderRecord.payment.payment_type === "full") {
        orderRecord.payment.payment_status = "paid";
      } else if (orderRecord.payment.payment_type === "partial") {
        //Update payment status if payment type is partial payment
        if (amountRemaining <= 0) {
          // If no amount remaining, mark as fully paid
          orderRecord.payment.payment_status = "paid";
        } else {
          // If there's still amount remaining, mark as partially paid
          orderRecord.payment.payment_status = "partially_paid";
        }
      }

      //Save order record with updated payment data
      await orderRecord.save();

      // Send payment success notifications if payment succeeded
      if (paymentStatus === 'succeeded') {
        const notificationService = require('./notification.service');

        // Notify client about successful payment
        if (orderRecord.client_id) {
          await notificationService.insertNotification({
            modelName: 'Payment',
            modelId: orderRecord._id,
            clientId: orderRecord.client_id,
            category: 'payment',
            message: `Payment of $${paymentRecord.amount} received for order "${orderRecord.order_name}"`,
            metadata: {
              title: 'Payment Confirmed',
              paymentIntentId: intentId,
              amount: paymentRecord.amount,
              paymentStatus: paymentStatus,
              orderId: orderRecord._id.toString(),
              orderName: orderRecord.order_name,
            }
          });
        }

        // Notify all assigned CPs about payment confirmation
        if (orderRecord.cp_ids && orderRecord.cp_ids.length > 0) {
          await notificationService.insertNotification({
            modelName: 'Payment',
            modelId: orderRecord._id,
            cpIds: orderRecord.cp_ids.map(cp => cp.id),
            category: 'payment',
            message: `Payment confirmed for order "${orderRecord.order_name}". You can now proceed with the shoot.`,
            metadata: {
              title: 'Payment Received',
              paymentIntentId: intentId,
              amount: paymentRecord.amount,
              paymentStatus: paymentStatus,
              orderId: orderRecord._id.toString(),
              orderName: orderRecord.order_name,
            }
          });
        }
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error(`WEBHOOK PAYMENT STATUS UPDATE ERROR: ${error.message}`);
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error(`WEBHOOK PAYMENT STATUS UPDATE ERROR: ${error.message}`);
  }
};

module.exports = {
  createPaymentIntent,
  getClientSecretByOrderId,
  getPaymentData,
  getPaymentIntentData,
  updatePaymentData,
  updatePaymentStatus,
};
