const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const { retrySimpleOperation } = require("../utils/retry");

/**
 * Create a Stripe checkout session
 * @param {Object} bookingData - The booking data
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Stripe session object
 */
const createCheckoutSession = async (bookingData, userId, bookingId = null) => {
  try {
    if (!bookingData) {
      throw new Error("Booking data is required");
    }

    const {
      durationHours,
      contentType,
      startDateTime,
      location,
      shootType,
      editType,
      guestEmail,
      guestName,
    } = bookingData;

    // Calculate pricing
    let basePrice;
    if (bookingData.manualPrice && bookingData.manualPrice > 0) {
      basePrice = bookingData.manualPrice;
    } else {
      basePrice = bookingData.budget || bookingData.totalBudget || durationHours * 250;
    }
    const totalAmount = basePrice * 100; // Stripe expects cents

    console.log("🔍 CREATE CHECKOUT SESSION - Booking Data:", totalAmount);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: guestEmail, // Pre-fill customer email
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Photography/Videography Session - ${Array.isArray(contentType)
                ? contentType.join(", ")
                : contentType
                }`,
              description: `${durationHours} hour session - ${shootType}${editType ? ` with ${editType}` : ""
                }`,
              metadata: {
                contentType: Array.isArray(contentType)
                  ? contentType.join(",")
                  : contentType,
                shootType: shootType || "",
                editType: editType || "",
                durationHours: durationHours.toString(),
                startDateTime: new Date(startDateTime).toISOString(),
                location: location || "",
              },
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${bookingId}`,
      cancel_url: `${process.env.CLIENT_URL}/booking/checkout`,
      client_reference_id: userId,
      metadata: {
        userId: userId || "",
        bookingId: bookingId || "legacy", // Include booking ID for webhook processing
        guestName: guestName || "",
        guestEmail: guestEmail || "",
        guestPhone: bookingData.guestPhone || "",
        bookingData: JSON.stringify(bookingData),
        basePrice: basePrice.toString(),
        discount: "0",
        totalAmount: (totalAmount / 100).toString(),
      },
    });

    return session;
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to create checkout session: ${error.message}`
    );
  }
};

/**
 * Retrieve a Stripe checkout session
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} Stripe session object
 */
const retrieveSession = async (sessionId) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "payment_intent"],
    });
    return session;
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to retrieve session: ${error.message}`
    );
  }
};

/**
 * Handle successful payment for booking system
 * @param {Object} session - Stripe session object
 * @returns {Promise<Object>} Payment processing result
 */
const handleSuccessfulPayment = async (session) => {
  try {
    const { client_reference_id: userId, metadata } = session;
    const bookingId = metadata.bookingId;

    // Handle new booking system vs legacy
    if (bookingId && bookingId !== "legacy") {
      return await handleBookingPaymentSuccess(session, bookingId);
    } else {
      // Legacy handling for backward compatibility
      return await handleLegacyPaymentSuccess(session);
    }
  } catch (error) {
    console.error("Payment handling error:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to handle successful payment: ${error.message}`
    );
  }
};

/**
 * Handle payment success for new booking system
 * @param {Object} session - Stripe session object
 * @param {string} bookingId - Booking ID from metadata
 * @returns {Promise<Object>} Processing result
 */
const handleBookingPaymentSuccess = async (session, bookingId) => {
  return retrySimpleOperation(
    async () => {
      const { bookingService, emailEnhancedService } = require("./index");
      const { metadata } = session;

      // Update booking with payment info
      const paymentData = {
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent?.id || session.id,
        paymentStatus: "paid",
        status: "paid",
        totalAmount: parseFloat(metadata.totalAmount),
        basePrice: parseFloat(metadata.basePrice),
        discount: parseFloat(metadata.discount || "0"),
      };

      const updatedBooking = await bookingService.updateBookingPayment(
        bookingId,
        "paid",
        paymentData
      );

      // Convert booking to order
      const order = await bookingService.convertBookingToOrder(bookingId);

      // Send confirmation emails
      let emailResult = null;
      try {
        if (!metadata.bookingData) {
          throw new Error("Booking data not found in session metadata");
        }
        const bookingData = JSON.parse(metadata.bookingData);
        const emailPaymentData = {
          confirmationNumber: updatedBooking.confirmationNumber,
          transactionId: session.payment_intent?.id || session.id,
          amount: parseFloat(metadata.totalAmount),
          paymentMethod: "Card ending in ****4242", // TODO: Get actual payment method
        };

        emailResult = await emailEnhancedService.sendBookingEmails(
          bookingData,
          emailPaymentData,
          bookingId
        );
        console.log(
          `[Email] Booking confirmation emails sent - Success: ${emailResult.success}`
        );
      } catch (emailError) {
        console.warn(
          "[Email] Failed to send booking confirmation emails:",
          emailError.message
        );
      }

      console.log(
        `Booking payment processed and converted to order: ${bookingId} -> ${order._id}`
      );

      return {
        booking: updatedBooking,
        order: order,
        emailResult: emailResult,
        success: true,
      };
    },
    {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
    }
  );
};

/**
 * Handle legacy payment success (backward compatibility)
 * @param {Object} session - Stripe session object
 * @returns {Promise<Object>} Processing result
 */
const handleLegacyPaymentSuccess = async (session) => {
  try {
    const { client_reference_id: userId, metadata } = session;
    if (!metadata.bookingData) {
      throw new Error("Booking data not found in session metadata");
    }
    const bookingData = JSON.parse(metadata.bookingData);

    // Create Airtable record for ops team
    const { airtableService, emailEnhancedService } = require("./index");
    const airtableRecord = await airtableService.createBookingFromPayment(
      session
    );

    // Prepare payment data for emails
    const paymentData = {
      confirmationNumber: airtableRecord.confirmationNumber,
      transactionId: session.payment_intent?.id || session.id,
      amount: parseFloat(metadata.totalAmount),
      paymentMethod: "Card ending in ****4242",
    };

    // Send confirmation emails
    let emailResult = null;
    try {
      emailResult = await emailEnhancedService.sendBookingEmails(
        bookingData,
        paymentData,
        airtableRecord.airtableId
      );
      console.log(
        `[Email] Legacy booking emails sent - Success: ${emailResult.success}`,
        emailResult.results
      );
    } catch (emailError) {
      console.warn(
        "[Email] Failed to send legacy booking emails:",
        emailError.message
      );
    }

    console.log(
      `Legacy booking created in Airtable: ${airtableRecord.confirmationNumber}`
    );

    return {
      airtableRecord: airtableRecord,
      emailResult: emailResult,
      success: true,
      legacy: true,
    };
  } catch (error) {
    console.error("Legacy payment processing failed:", error);
    throw error;
  }
};

/**
 * Create a payment intent for custom checkout
 * @param {Object} bookingData - The booking data
 * @param {string} userId - The user ID
 * @param {string} bookingId - The booking ID
 * @param {Object} options - Additional options (manualPrice, salesRepId)
 * @returns {Promise<Object>} Payment intent object
 */
const createPaymentIntent = async (bookingData, userId, bookingId = null, options = {}) => {
  try {
    if (!bookingData) {
      throw new Error("Booking data is required");
    }

    const { durationHours, guestEmail, guestName } = bookingData;
    const { manualPrice, salesRepId } = options;

    console.log("🔍 CREATE PAYMENT INTENT - Options received:", { manualPrice, salesRepId, userId });

    // Calculate pricing
    let basePrice;
    let totalAmount;

    if (manualPrice && manualPrice > 0) {
      // Sales rep provided manual price
      basePrice = manualPrice;
      totalAmount = manualPrice * 100; // Convert to cents for Stripe
      console.log(`💰 Using manual price from sales rep: $${manualPrice}`);
    } else {
      // Regular automated pricing
      basePrice = durationHours * 250; // $250 per hour
      const earlyBirdDiscount = 0; // $160 early bird discount
      totalAmount = (basePrice - earlyBirdDiscount) * 100; // Convert to cents for Stripe
      console.log(`💰 Using calculated price: $${basePrice}`);
    }

    const metadata = {
      userId: userId || "", // Empty string if null (guest/sales rep booking)
      bookingId: bookingId || "legacy", // Include booking ID for webhook processing
      guestName,
      guestEmail,
      guestPhone: bookingData.guestPhone,
      bookingData: JSON.stringify(bookingData),
      basePrice: basePrice.toString(),
      discount: "0",
      totalAmount: (totalAmount / 100).toString(),
      salesRepId: salesRepId || "", // Add sales rep ID to metadata
      manualPrice: manualPrice ? manualPrice.toString() : "",
    };

    console.log("🔍 CREATE PAYMENT INTENT - Metadata to be stored:", {
      salesRepId: metadata.salesRepId,
      manualPrice: metadata.manualPrice,
      totalAmount: metadata.totalAmount,
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: guestEmail, // Send receipt to guest email
      metadata,
    });

    return paymentIntent;
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to create payment intent: ${error.message}`
    );
  }
};

/**
 * Confirm a payment intent
 * @param {string} paymentIntentId - The payment intent ID
 * @param {string} paymentMethodId - The payment method ID
 * @returns {Promise<Object>} Payment intent object
 */
const confirmPaymentIntent = async (paymentIntentId, paymentMethodId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
    return paymentIntent;
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to confirm payment: ${error.message}`
    );
  }
};

/**
 * Handle payment intent success (custom checkout flow)
 * @param {Object} paymentIntent - Stripe payment intent object
 * @returns {Promise<Object>} Processing result
 */
const handlePaymentIntentSuccess = async (paymentIntent) => {
  try {
    const { metadata } = paymentIntent;
    const bookingId = metadata.bookingId;

    // Handle new booking system vs legacy
    if (bookingId && bookingId !== "legacy") {
      return await handleBookingPaymentIntentSuccess(paymentIntent, bookingId);
    } else {
      // Legacy handling for backward compatibility
      return await handleLegacyPaymentIntentSuccess(paymentIntent);
    }
  } catch (error) {
    console.error("Payment intent handling error:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to handle payment intent success: ${error.message}`
    );
  }
};

/**
 * Handle payment intent success for new booking system
 * @param {Object} paymentIntent - Stripe payment intent object
 * @param {string} bookingId - Booking ID from metadata
 * @returns {Promise<Object>} Processing result
 */
const handleBookingPaymentIntentSuccess = async (paymentIntent, bookingId) => {
  return retrySimpleOperation(
    async () => {
      const { bookingService, emailEnhancedService } = require("./index");
      const { metadata } = paymentIntent;

      console.log("🔍 WEBHOOK - Payment Intent Metadata:", {
        salesRepId: metadata.salesRepId,
        manualPrice: metadata.manualPrice,
        totalAmount: metadata.totalAmount,
        bookingId: metadata.bookingId,
      });

      // Validate booking exists before processing
      const Booking = require("../models/booking.model");
      const booking = await Booking.findById(bookingId);

      if (!booking) {
        const errorMsg = `Booking not found: ${bookingId}`;
        console.error("❌ WEBHOOK ERROR:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("✅ WEBHOOK - Booking found:", {
        bookingId: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        guestEmail: booking.guestEmail,
      });

      // Update booking with payment info
      const paymentData = {
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus: "paid",
        status: "paid",
        totalAmount: paymentIntent.amount / 100, // Convert from cents
        basePrice: parseFloat(metadata.basePrice),
        discount: parseFloat(metadata.discount || "0"),
        // Include manual price if sales rep set it
        ...(metadata.manualPrice && metadata.manualPrice !== "" && {
          manualPrice: parseFloat(metadata.manualPrice)
        }),
      };

      console.log("🔍 WEBHOOK - Payment data to save:", paymentData);

      const updatedBooking = await bookingService.updateBookingPayment(
        bookingId,
        "paid",
        paymentData
      );

      // Convert booking to order
      const order = await bookingService.convertBookingToOrder(bookingId);

      // Create Airtable record now that payment is successful
      try {
        await bookingService.createAirtableRecord(updatedBooking);
        console.log(`[Airtable] Booking synced to Airtable: ${bookingId}`);
      } catch (airtableError) {
        console.warn(
          "[Airtable] Failed to sync booking to Airtable:",
          airtableError.message
        );
      }

      // Send confirmation emails
      let emailResult = null;
      try {
        if (!metadata.bookingData) {
          throw new Error("Booking data not found in payment intent metadata");
        }
        const bookingData = JSON.parse(metadata.bookingData);
        const emailPaymentData = {
          confirmationNumber: updatedBooking.confirmationNumber,
          transactionId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          paymentMethod: "Card ending in ****4242", // TODO: Get actual payment method
        };

        emailResult = await emailEnhancedService.sendBookingEmails(
          bookingData,
          emailPaymentData,
          bookingId
        );
        console.log(
          `[Email] Payment intent booking emails sent - Success: ${emailResult.success}`
        );
      } catch (emailError) {
        console.warn(
          "[Email] Failed to send payment intent booking emails:",
          emailError.message
        );
      }

      // If this is a sales rep booking, send shareable link email
      const salesRepId = metadata.salesRepId;
      console.log("🔍 WEBHOOK - Sales Rep Email Check:", {
        salesRepId,
        hasSalesRepId: !!salesRepId,
        isNotEmpty: salesRepId !== "",
        willSendEmail: !!(salesRepId && salesRepId !== "")
      });

      if (salesRepId && salesRepId !== "") {
        try {
          console.log("📧 WEBHOOK - Attempting to send sales rep email...");
          const Booking = require("../models/booking.model");
          const { sendSalesRepConfirmation } = require("./email.enhanced.service");

          // Get booking details with sales rep info
          const bookingWithRep = await Booking.findById(bookingId).populate('salesRepId');

          if (!bookingWithRep) {
            console.error("❌ WEBHOOK - Booking not found:", bookingId);
            return;
          }

          const salesRep = bookingWithRep.salesRepId;

          if (!salesRep || !salesRep.email) {
            console.warn("⚠️ WEBHOOK - Sales rep not found or has no email:", salesRepId);
            return;
          }

          console.log("📧 WEBHOOK - Sales rep found:", {
            salesRepId: salesRep._id,
            salesRepEmail: salesRep.email,
            salesRepName: salesRep.name,
            clientName: bookingWithRep.guestName
          });

          const shareableLink = `${process.env.CLIENT_URL}/order?id=${bookingId}`;

          // Send email using the dedicated function
          const emailResult = await sendSalesRepConfirmation({
            salesRepEmail: salesRep.email,
            salesRepName: salesRep.name,
            clientName: bookingWithRep.guestName,
            clientEmail: bookingWithRep.guestEmail,
            shareableLink: shareableLink,
            bookingId: bookingId,
            confirmationNumber: updatedBooking.confirmationNumber,
            amount: paymentIntent.amount / 100
          });

          if (emailResult.success) {
            console.log(`✅ WEBHOOK - Sales rep email sent successfully to: ${salesRep.email}`, {
              messageId: emailResult.messageId
            });
          } else {
            console.error(`❌ WEBHOOK - Failed to send sales rep email:`, emailResult.error);
          }

        } catch (salesRepEmailError) {
          console.error(
            "❌ WEBHOOK - Error sending sales rep shareable link:",
            salesRepEmailError.message,
            salesRepEmailError.stack
          );
        }
      } else {
        console.log("⏭️ WEBHOOK - Skipping sales rep email (no salesRepId)");
      }

      console.log(
        `Payment intent booking processed and converted to order: ${bookingId} -> ${order._id}`
      );

      return {
        booking: updatedBooking,
        order: order,
        emailResult: emailResult,
        success: true,
      };
    },
    {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
    }
  );
};

/**
 * Handle legacy payment intent success (backward compatibility)
 * @param {Object} paymentIntent - Stripe payment intent object
 * @returns {Promise<Object>} Processing result
 */
const handleLegacyPaymentIntentSuccess = async (paymentIntent) => {
  try {
    // Create Airtable record for ops team
    const { airtableService, emailEnhancedService } = require("./index");
    const airtableRecord = await airtableService.createBookingFromPayment(
      paymentIntent
    );

    // Extract booking data from payment intent metadata
    if (!paymentIntent.metadata.bookingData) {
      throw new Error("Booking data not found in payment intent metadata");
    }
    const bookingData = JSON.parse(paymentIntent.metadata.bookingData);

    // Prepare payment data for emails
    const paymentData = {
      confirmationNumber: airtableRecord.confirmationNumber,
      transactionId: paymentIntent.id,
      amount: paymentIntent.amount / 100, // Convert from cents
      paymentMethod: "Card ending in ****4242",
    };

    // Send confirmation emails
    let emailResult = null;
    try {
      emailResult = await emailEnhancedService.sendBookingEmails(
        bookingData,
        paymentData,
        airtableRecord.airtableId
      );
      console.log(
        `[Email] Legacy payment intent emails sent - Success: ${emailResult.success}`,
        emailResult.results
      );
    } catch (emailError) {
      console.warn(
        "[Email] Failed to send legacy payment intent emails:",
        emailError.message
      );
    }

    console.log(
      `Legacy payment intent booking created in Airtable: ${airtableRecord.confirmationNumber}`
    );
    return {
      airtableRecord: airtableRecord,
      emailResult: emailResult,
      success: true,
      legacy: true,
    };
  } catch (error) {
    console.error("Legacy payment intent processing failed:", error);
    throw error;
  }
};

/**
 * Handle Stripe webhook events
 * @param {Object} event - Stripe webhook event
 * @returns {Promise<void>}
 */
const handleWebhookEvent = async (event) => {
  try {
    console.log(`Processing webhook event: ${event.type}`, {
      eventId: event.id,
      objectId: event.data.object.id,
      hasMetadata: !!event.data.object.metadata,
      metadataKeys: event.data.object.metadata
        ? Object.keys(event.data.object.metadata)
        : [],
    });

    switch (event.type) {
      case "checkout.session.completed":
        await handleSuccessfulPayment(event.data.object);
        break;
      case "payment_intent.succeeded":
        // Handle payment intent success for custom checkout flow
        await handlePaymentIntentSuccess(event.data.object);
        console.log(
          "Payment intent succeeded and booking created:",
          event.data.object.id
        );
        break;
      case "payment_intent.payment_failed":
        // Handle payment failure
        console.log("Payment failed:", event.data.object.id);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error("❌ Webhook handling error:", {
      eventType: event.type,
      eventId: event.id,
      objectId: event.data?.object?.id,
      bookingId: event.data?.object?.metadata?.bookingId,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    throw error;
  }
};

module.exports = {
  createCheckoutSession,
  retrieveSession,
  handleSuccessfulPayment,
  handleBookingPaymentSuccess,
  handleLegacyPaymentSuccess,
  handlePaymentIntentSuccess,
  handleBookingPaymentIntentSuccess,
  handleLegacyPaymentIntentSuccess,
  createPaymentIntent,
  confirmPaymentIntent,
  handleWebhookEvent,
};
