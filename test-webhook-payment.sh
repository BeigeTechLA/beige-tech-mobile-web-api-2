#!/bin/bash

# Test Stripe Webhook for Payment Intent Success
# This script tests the webhook endpoint with a mock payment_intent.succeeded event
# IMPORTANT: Only works in development mode with NODE_ENV=development

echo "🧪 Testing Stripe Webhook - Payment Intent Success"
echo "=================================================="
echo ""

# Configuration
API_URL="${API_URL:-http://localhost:5002}"
WEBHOOK_ENDPOINT="${API_URL}/v1/stripe/webhook"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if bookingId is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Booking ID is required${NC}"
    echo ""
    echo "Usage: ./test-webhook-payment.sh <bookingId>"
    echo ""
    echo "Example: ./test-webhook-payment.sh 6943d508d4a4587bf0c62304"
    echo ""
    echo "To create a test booking first, run:"
    echo "  npm run test:create-booking"
    exit 1
fi

BOOKING_ID=$1
PAYMENT_INTENT_ID="pi_test_$(date +%s)_${RANDOM}"

echo -e "${YELLOW}📋 Test Configuration:${NC}"
echo "  Webhook URL: ${WEBHOOK_ENDPOINT}"
echo "  Booking ID: ${BOOKING_ID}"
echo "  Payment Intent ID: ${PAYMENT_INTENT_ID}"
echo ""

# Create the webhook payload
WEBHOOK_PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_$(date +%s)",
  "object": "event",
  "api_version": "2024-11-20",
  "created": $(date +%s),
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "${PAYMENT_INTENT_ID}",
      "object": "payment_intent",
      "amount": 100000,
      "currency": "usd",
      "status": "succeeded",
      "metadata": {
        "bookingId": "${BOOKING_ID}",
        "userId": "",
        "guestName": "Test Customer",
        "guestEmail": "test@example.com",
        "guestPhone": "+1-555-0123",
        "basePrice": "1000.00",
        "discount": "0",
        "totalAmount": "1000.00",
        "bookingData": "{\"contentType\":\"photography\",\"shootType\":\"Brand Campaign\",\"editType\":\"Basic Color Correction\",\"durationHours\":4,\"startDateTime\":\"2025-12-30T10:00:00.000Z\",\"location\":\"Los Angeles, CA\",\"guestName\":\"Test Customer\",\"guestEmail\":\"test@example.com\",\"guestPhone\":\"+1-555-0123\"}"
      }
    }
  },
  "livemode": false,
  "pending_webhooks": 1,
  "request": {
    "id": "req_test",
    "idempotency_key": null
  }
}
EOF
)

echo -e "${YELLOW}📤 Sending webhook request...${NC}"
echo ""

# Send the webhook request with test header
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --location "${WEBHOOK_ENDPOINT}" \
  --header "Content-Type: application/json" \
  --data "${WEBHOOK_PAYLOAD}")

# Extract status code and response body
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

echo "📥 Response:"
echo "  HTTP Status: ${HTTP_CODE}"
echo "  Body: ${RESPONSE_BODY}"
echo ""

# Check result
if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Webhook processed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Check the booking status:"
    echo "     curl http://localhost:5002/v1/bookings/${BOOKING_ID}"
    echo ""
    echo "  2. Check if order was created:"
    echo "     curl http://localhost:5002/v1/orders?bookingId=${BOOKING_ID}"
    echo ""
    echo "  3. Check server logs for email sending status"
    exit 0
else
    echo -e "${RED}❌ Webhook failed with status ${HTTP_CODE}${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Make sure the server is running (npm run dev)"
    echo "  2. Make sure NODE_ENV=development"
    echo "  3. Check if the booking ID exists in the database"
    echo "  4. Check server logs for error details"
    exit 1
fi
