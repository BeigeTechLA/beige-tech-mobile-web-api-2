const axios = require("axios");

async function testStripeWebhook() {
  console.log("🧪 Testing Stripe webhook endpoint...\n");

  try {
    // Mock webhook payload (this would normally come from Stripe)
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

    console.log("📤 Testing basic webhook endpoint connectivity...");

    // First test without signature (should fail with signature error)
    try {
      const response = await axios.post(
        "http://localhost:5001/v1/stripe/webhook",
        mockWebhookPayload,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      console.log("❌ Unexpected success - webhook should require signature");
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log("✅ Webhook correctly requires signature verification");
        console.log(`   Response: ${error.response.data}`);
      } else if (error.code === "ECONNREFUSED") {
        console.log("❌ Server is not running on port 5001");
        console.log("💡 Start the server with: npm run dev:local");
        return;
      } else {
        console.log("❌ Unexpected error:", error.message);
      }
    }

    console.log("\n💡 To fully test the webhook:");
    console.log(
      "1. Use Stripe CLI: stripe listen --forward-to localhost:5001/v1/stripe/webhook"
    );
    console.log("2. Or use ngrok + Stripe dashboard webhook configuration");
    console.log("   Point webhook to: http://localhost:5001/v1/stripe/webhook");
    console.log(
      "3. The webhook will create Airtable records when payments succeed"
    );
  } catch (error) {
    console.error("💥 Test failed:", error.message);
  }
}

// Run the test
testStripeWebhook()
  .then(() => {
    console.log("\n✨ Webhook connectivity test completed!");
  })
  .catch((error) => {
    console.error("💥 Test failed:", error.message);
    process.exit(1);
  });
