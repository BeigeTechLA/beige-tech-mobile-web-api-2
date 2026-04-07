const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const config = require("../config/config");
const {
    stripeService
} = require("../services");
const monitoringService = require("../services/monitoring.service");

/**
 * Create checkout session
 */
const createCheckoutSession = catchAsync(async (req, res) => {
    // For testing without auth, use a mock user ID
    const userId = req.user.id || "mock-user-id-for-testing";
    const bookingData = req.body;

    const session = await stripeService.createCheckoutSession(
        bookingData,
        userId
    );

    res.status(httpStatus.CREATED).json({
        success: true,
        message: "Checkout session created successfully",
        data: {
            sessionId: session.id,
            url: session.url,
        },
    });
});

/**
 * Create payment intent for custom checkout
 */
const createPaymentIntent = catchAsync(async (req, res) => {
    const {
        manualPrice,
        ...bookingData
    } = req.body;

    // Get userId from request body (more reliable than auth headers)
    // Handle case where req.user might be null (guest users)
    const userId = bookingData.userId || (req.user ? req.user.id : null) || null;

    // Fetch user role from database using userId instead of relying on req.user
    let userRole = null;
    let isSalesRep = false;

    if (userId) {
        try {
            const User = require('../models/user.model');
            const user = await User.findById(userId);
            if (user) {
                userRole = user.role;
                // Handle both 'sales_rep' and 'sales_representative' role variations
                isSalesRep = userRole === 'sales_rep' || userRole === 'sales_representative';
                console.log("✅ User role fetched from database:", {
                    userId,
                    userRole,
                    isSalesRep
                });
            } else {
                console.log("⚠️ User not found in database:", userId);
            }
        } catch (error) {
            console.error("❌ Error fetching user role:", error.message);
            // Fallback to req.user if database fetch fails
            userRole = req.user?.role;
            isSalesRep = userRole === 'sales_rep' || userRole === 'sales_representative';
        }
    } else {
        console.log("⚠️ No userId provided - proceeding as guest");
    }

    // DEBUG: Log payment intent creation with auth details
    console.log("💳 Payment Intent creation debug:", {
        hasAuthHeader: !!req.headers.authorization,
        userIdFromBody: bookingData.userId,
        userIdFromAuth: req.user?.id || null,
        finalUserId: userId,
        userRoleFromDB: userRole,
        isSalesRep: isSalesRep,
        hasManualPrice: !!manualPrice,
        manualPrice: manualPrice,
        guestEmail: bookingData.guestEmail,
    });

    // Additional debug for sales rep specific flow
    if (isSalesRep) {
        console.log("🎯 SALES REP DETECTED - Additional Details:", {
            userId,
            userRole,
            manualPrice,
            willSetSalesRepId: !!(userId),
            willSetManualPrice: !!(manualPrice && manualPrice > 0)
        });
    }

    // Calculate endDateTime if not provided but startDateTime and durationHours are available
    if (
        bookingData.startDateTime &&
        bookingData.durationHours &&
        !bookingData.endDateTime
    ) {
        const startDate = new Date(bookingData.startDateTime);
        const endDate = new Date(
            startDate.getTime() + bookingData.durationHours * 60 * 60 * 1000
        );
        bookingData.endDateTime = endDate.toISOString();
        console.log(
            `📅 Calculated endDateTime: ${bookingData.endDateTime} (${bookingData.durationHours}h after ${bookingData.startDateTime})`
        );
    }

    // Set location to "Beige Studio" if needStudio is true and no location is provided
    if (bookingData.needStudio && !bookingData.location) {
        bookingData.location = "Beige Studio";
        console.log(`🏢 Set location to "Beige Studio" based on needStudio flag`);
    }

    // No mapping needed - booking model now accepts frontend values directly

    // Determine final price: manual price (sales rep) or calculated price
    let finalPrice;
    if (isSalesRep && manualPrice) {
        finalPrice = manualPrice;
        bookingData.budget = manualPrice;
        bookingData.manualPrice = manualPrice;
        console.log(
            `💰 Using manual price (sales rep): $${manualPrice}`
        );
    } else if (!bookingData.budget && bookingData.durationHours) {
        // Set default budget if not provided (using duration-based pricing)
        const basePrice = bookingData.durationHours * 250; // $250 per hour
        bookingData.budget = basePrice;
        finalPrice = basePrice;
        console.log(
            `💰 Set default budget to: $${bookingData.budget} (${bookingData.durationHours}h × $250)`
        );
    } else {
        finalPrice = bookingData.budget;
    }

    // First, create the booking record in MongoDB
    const {
        bookingService
    } = require("../services");

    // Get user data if authenticated (for filling in guest fields)
    let userData = null;
    if (userId && req.user) {
        userData = req.user;
    }

    // Clean bookingData by removing userId (it's passed separately)
    const {
        userId: _,
        skipPayment,
        amount,
        discountCode,
        isDiscounted,
        ...cleanBookingData
    } = bookingData;

    // Add salesRepId if this is a sales rep booking
    if (isSalesRep && userId) {
        cleanBookingData.salesRepId = userId;
        console.log(`👔 Sales rep booking - salesRepId: ${userId}`);
    }

    // Sanitize guest data - use provided values or fall back to user data
    cleanBookingData.guestName = cleanBookingData.guestName || userData?.name || userData ?.email || "Guest User";
    cleanBookingData.guestEmail = cleanBookingData.guestEmail || userData?.email || "";
    cleanBookingData.guestPhone = cleanBookingData.guestPhone || userData?.phone || "";

    console.log("👤 Guest data sanitized:", {
        guestName: cleanBookingData.guestName,
        guestEmail: cleanBookingData.guestEmail,
        guestPhone: cleanBookingData.guestPhone,
        isAuthenticated: !!userId,
        isSalesRep: isSalesRep,
        salesRepId: cleanBookingData.salesRepId,
    });

    // Check if this is a $0 order with discount code
    const isFreeBooking = skipPayment === true || amount === 0 || isDiscounted === true;

    console.log("💳 Booking type check:", {
        skipPayment,
        amount,
        isDiscounted,
        discountCode,
        isFreeBooking,
    });

    // If this is a free booking, set budget/price to $0
    if (isFreeBooking) {
        cleanBookingData.budget = 0;
        cleanBookingData.totalAmount = 0;
        cleanBookingData.discountCode = discountCode;
        cleanBookingData.isDiscounted = true;
        console.log("💰 Set booking amounts to $0 for free booking");
    }

    // IMPORTANT: If sales rep is creating booking, pass null as userId (not the sales rep's ID)
    // The client will claim this booking later when they sign up
    const clientUserId = isSalesRep ? null : userId;

    const booking = await bookingService.createBooking(cleanBookingData, clientUserId, {
        skipAirtableSync: !isFreeBooking, // Sync immediately for free bookings, wait for payment for paid ones
    });

    // If this is a free booking (discount applied), skip Stripe and complete directly
    if (isFreeBooking) {
        console.log("🎉 Free booking detected - skipping Stripe payment");

        // Generate unique identifier for free booking (to avoid duplicate key error on unique index)
        const freeBookingId = `FREE-${booking._id.toString()}-${Date.now()}`;

        // Calculate original price for tracking purposes
        const originalBasePrice = bookingData.durationHours ? bookingData.durationHours * 250 : 0;

        // Update booking with $0 payment info
        const paymentData = {
            stripePaymentIntentId: freeBookingId, // Unique ID for free booking (not null to avoid index conflict)
            paymentStatus: "paid",
            status: "paid",
            totalAmount: 0, // Final amount after discount
            basePrice: 0, // Set to 0 so original price doesn't appear
            discount: originalBasePrice, // Show the full discount amount
            discountCode: discountCode || null,
            isDiscounted: true,
        };

        const updatedBooking = await bookingService.updateBookingPayment(
            booking._id.toString(),
            "paid",
            paymentData
        );

        // Convert booking to order
        const order = await bookingService.convertBookingToOrder(booking._id.toString());

        // Send confirmation emails for free booking
        try {
            const {
                emailEnhancedService
            } = require("../services");
            const emailPaymentData = {
                confirmationNumber: updatedBooking.confirmationNumber,
                transactionId: freeBookingId,
                amount: 0,
                paymentMethod: "Discount Code Applied",
            };

            await emailEnhancedService.sendBookingEmails(
                cleanBookingData,
                emailPaymentData,
                booking._id.toString()
            );
            console.log("[Email] Free booking confirmation emails sent");
        } catch (emailError) {
            console.warn("[Email] Failed to send free booking emails:", emailError.message);
        }

        // Return success without payment intent
        return res.status(httpStatus.CREATED).json({
            success: true,
            message: "Free booking created successfully",
            data: {
                booking: {
                    id: updatedBooking._id,
                    status: updatedBooking.status,
                    confirmationNumber: updatedBooking.confirmationNumber,
                    confirmation_number: updatedBooking.confirmationNumber,
                },
                order: order,
                isFree: true,
            },
        });
    }

    // Regular payment flow - create PaymentIntent with the booking ID
    const paymentIntentOptions = {
        manualPrice: isSalesRep && manualPrice ? manualPrice : null,
        salesRepId: isSalesRep && userId ? userId : null
    };

    console.log("🔍 STRIPE CONTROLLER - Creating payment intent with options:", {
        isSalesRep,
        authenticatedUserId: userId,
        clientUserId: clientUserId,
        manualPrice,
        paymentIntentOptions,
        bookingId: booking._id.toString()
    });

    // IMPORTANT: Pass clientUserId (null for sales rep), not the authenticated userId
    const paymentIntent = await stripeService.createPaymentIntent(
        cleanBookingData,
        clientUserId, // null for sales reps, actual userId for direct client bookings
        booking._id.toString(), // Pass the booking ID
        paymentIntentOptions
    );

    res.status(httpStatus.CREATED).json({
        success: true,
        message: "Payment intent created successfully",
        data: {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            booking: {
                id: booking._id,
                status: booking.status,
                confirmationNumber: booking.confirmationNumber,
            },
        },
    });
});

/**
 * Confirm payment intent
 */
const confirmPayment = catchAsync(async (req, res) => {
    const {
        paymentIntentId,
        paymentMethodId
    } = req.body;

    const paymentIntent = await stripeService.confirmPaymentIntent(
        paymentIntentId,
        paymentMethodId
    );

    if (paymentIntent.status === "succeeded") {
        // Create booking after successful payment
        const userId = req.user?.id || "mock-user-id-for-testing";
        const booking = await stripeService.handleSuccessfulPayment({
            payment_intent: paymentIntent,
            client_reference_id: userId,
            metadata: paymentIntent.metadata,
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Payment confirmed successfully",
            data: {
                paymentIntent,
                booking,
            },
        });
    } else {
        res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Payment confirmation failed",
            data: {
                paymentIntent
            },
        });
    }
});

/**
 * Retrieve checkout session
 */
const getSession = catchAsync(async (req, res) => {
    const {
        sessionId
    } = req.params;

    const session = await stripeService.retrieveSession(sessionId);

    res.status(httpStatus.OK).json({
        success: true,
        message: "Session retrieved successfully",
        data: session,
    });
});

/**
 * Handle Stripe webhooks
 */
const webhook = catchAsync(async (req, res) => {
    const stripe = require("stripe")(config.stripe.secretKey);
    const endpointSecret = config.stripe.endpointSecret;

    // Debug logging
    console.log("🎯 Webhook received:");
    console.log("  Content-Type:", req.headers["content-type"]);
    console.log("  Origin:", req.headers["origin"] || "No origin header (server-to-server)");
    console.log("  Referer:", req.headers["referer"] || "No referer header");
    console.log("  User-Agent:", req.headers["user-agent"] || "No user-agent");
    console.log("  Body type:", typeof req.body);
    console.log("  Body is Buffer:", Buffer.isBuffer(req.body));
    console.log("  Body length:", req.body ? req.body.length : "undefined");
    console.log("  Environment:", config.env);
    console.log("  Has stripe-signature:", !!req.headers["stripe-signature"]);

    let event;

    // Check if this is a test webhook from frontend
    const isTestWebhook = req.headers["x-test-webhook"] === "true";
    const isDevelopment = config.env === "development" || config.env === "test";
    const hasOriginHeader = !!req.headers["origin"]; // Browser-based requests have Origin header
    const sig = req.headers["stripe-signature"];

    // Allow test webhooks in development OR when explicitly flagged from browser (staging/prod testing)
    // Security: We validate that it's a browser request (has Origin) and explicitly marked as test
    const allowTestWebhook = isTestWebhook && (isDevelopment || (hasOriginHeader && !sig));

    if (allowTestWebhook) {
        // Test webhook from frontend - parse body directly without signature validation
        console.log("🧪 Test webhook detected - skipping signature validation");
        console.log("   Environment:", config.env);
        console.log("   Has Origin:", hasOriginHeader);
        console.log("   Origin:", req.headers["origin"]);
        
        try {
            // Body is already parsed as raw buffer, convert to string and parse as JSON
            const rawBody = req.body.toString('utf8');
            event = JSON.parse(rawBody);
            console.log("✅ Test webhook event parsed:", event.type);
            console.log("   Event ID:", event.id);
            console.log("   Payment Intent ID:", event.data?.object?.id);
        } catch (err) {
            console.log("❌ Failed to parse test webhook body:", err.message);
            return res.status(400).send(`Webhook Error: Invalid JSON in test webhook - ${err.message}`);
        }
    } else if (sig) {
        // Real Stripe webhook - validate signature
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            console.log("✅ Webhook signature verified successfully");
            console.log("   Event type:", event.type);
            console.log("   Event ID:", event.id);
        } catch (err) {
            console.log(`❌ Webhook signature verification failed:`, err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    } else {
        // No signature and not a test webhook - reject
        console.log("❌ Missing stripe-signature header and not a test webhook");
        console.log("   isTestWebhook:", isTestWebhook);
        console.log("   isDevelopment:", isDevelopment);
        console.log("   hasOriginHeader:", hasOriginHeader);
        return res.status(400).send("Webhook Error: No stripe-signature header provided. For test webhooks, use x-test-webhook: true header.");
    }

    try {
        await stripeService.handleWebhookEvent(event);

        // Track successful webhook processing
        monitoringService.trackPaymentEvent("webhook_processed", {
            eventType: event.type,
            paymentIntentId: event.data.object ?.id,
            amount: event.data.object ?.amount,
            currency: event.data.object ?.currency,
            status: event.data.object ?.status,
        });

        res.status(200).json({
            received: true
        });
    } catch (error) {
        console.error("❌ Webhook handling failed:", {
            errorMessage: error.message,
            errorStack: error.stack,
            eventType: event ?.type,
            eventId: event ?.id,
            bookingId: event ?.data ?.object ?.metadata ?.bookingId,
        });

        // Track webhook processing failure
        monitoringService.captureError(error, {
            webhookEvent: {
                type: event.type,
                id: event.id,
                paymentIntentId: event.data.object ?.id,
                bookingId: event.data.object ?.metadata ?.bookingId,
            },
            context: "stripe_webhook_processing",
        });

        // Return detailed error in development, generic in production
        const errorResponse = config.env === 'development' ? {
            error: "Webhook handling failed",
            details: error.message,
            bookingId: event ?.data ?.object ?.metadata ?.bookingId,
            eventType: event ?.type,
        } : {
            error: "Webhook handling failed"
        };

        res.status(500).json(errorResponse);
    }
});

module.exports = {
    createCheckoutSession,
    createPaymentIntent,
    confirmPayment,
    getSession,
    webhook,
};