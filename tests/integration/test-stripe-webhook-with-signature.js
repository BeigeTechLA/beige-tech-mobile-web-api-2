const axios = require("axios");
const crypto = require("crypto");

async function testStripeWebhookWithSignature() {
  console.log("🧪 Testing Stripe webhook with proper signature...\n");

  try {
    // Mock webhook payload
    const mockWebhookPayload = {
      id: "evt_test_webhook",
      object: "event",
      api_version: "2020-08-27",
      created: 1234567890,
      data: {
        object: {
          id: "cs_test_123456789",
          object: "checkout.session",
          payment_intent: "pi_test_123456789",
          payment_status: "paid",
          metadata: {
            userId: "test-user-123",
            guestName: "Test User",
            guestEmail: "test@example.com",
            guestPhone: "+1-555-0123",
            bookingData: JSON.stringify({
              contentType: "photography",
              shootType: "Brand Campaign",
              editType: "Basic Color Correction",
              durationHours: 4,
              startDateTime: "2025-02-01T10:00:00.000Z",
              location: "Los Angeles, CA",
              guestName: "Test User",
              guestEmail: "test@example.com",
              guestPhone: "+1-555-0123",
            }),
            totalAmount: "840.00",
            basePrice: "1000.00",
            discount: "160.00",
          },
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: "req_test",
        idempotency_key: null,
      },
      type: "checkout.session.completed",
    };

    const payload = JSON.stringify(mockWebhookPayload);
    const timestamp = Math.floor(Date.now() / 1000);
    const webhookSecret = "whsec_test_secret_for_testing_only";

    // Create a proper Stripe signature
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(timestamp + "." + payload)
      .digest("hex");

    const stripeSignature = `t=${timestamp},v1=${signature}`;

    console.log("📤 Testing webhook with proper signature...");

    try {
      const response = await axios.post(
        "http://localhost:5001/v1/stripe/webhook",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": stripeSignature,
          },
          timeout: 10000,
        }
      );

      console.log("✅ Webhook processed successfully!");
      console.log(`   Response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      if (error.response) {
        console.log("❌ Webhook failed with status:", error.response.status);
        console.log(`   Response: ${error.response.data}`);

        if (
          error.response.status === 400 &&
          error.response.data.includes("signature")
        ) {
          console.log(
            "💡 This is expected - the test signature is not valid for your webhook secret"
          );
          console.log(
            "   In production, Stripe will provide the correct signature"
          );
        }
      } else if (error.code === "ECONNREFUSED") {
        console.log("❌ Server is not running on port 5001");
        console.log("💡 Start the server with: npm run dev:local");
        return;
      } else {
        console.log("❌ Unexpected error:", error.message);
      }
    }

    console.log("\n💡 For real testing:");
    console.log(
      "1. Use Stripe CLI: stripe listen --forward-to localhost:5001/v1/stripe/webhook"
    );
    console.log(
      "2. Or configure webhook in Stripe Dashboard with your actual endpoint"
    );
    console.log(
      "3. The webhook will create Airtable records when payments succeed"
    );
  } catch (error) {
    console.error("💥 Test failed:", error.message);
  }
}

// Run the test
testStripeWebhookWithSignature()
  .then(() => {
    console.log("\n✨ Webhook signature test completed!");
  })
  .catch((error) => {
    console.error("💥 Test failed:", error.message);
    process.exit(1);
  });
