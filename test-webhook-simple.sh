#!/bin/bash

# Simple Webhook Test - Quick test for debugging
# Usage: ./test-webhook-simple.sh [bookingId]

if [ -z "$1" ]; then
    echo "❌ Error: Booking ID is required"
    echo ""
    echo "Usage: ./test-webhook-simple.sh <bookingId>"
    echo ""
    echo "To create a test booking and run the full test, use:"
    echo "  ./test-webhook-e2e.sh"
    exit 1
fi

BOOKING_ID="$1"

echo "🧪 Testing webhook with booking ID: ${BOOKING_ID}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
--location 'http://localhost:5002/v1/stripe/webhook' \
--header 'Content-Type: application/json' \
--data "{
  \"type\": \"payment_intent.succeeded\",
  \"data\": {
    \"object\": {
      \"id\": \"pi_test_$(date +%s)\",
      \"amount\": 100000,
      \"currency\": \"usd\",
      \"status\": \"succeeded\",
      \"metadata\": {
        \"bookingId\": \"${BOOKING_ID}\",
        \"userId\": \"\",
        \"guestName\": \"Test Customer\",
        \"guestEmail\": \"test@example.com\",
        \"guestPhone\": \"+1-555-0123\",
        \"basePrice\": \"1000.00\",
        \"discount\": \"0\",
        \"totalAmount\": \"1000.00\",
        \"bookingData\": \"{\\\"serviceType\\\":\\\"shoot-edit\\\",\\\"contentType\\\":\\\"photography\\\",\\\"shootType\\\":\\\"Brand Campaign\\\",\\\"editType\\\":\\\"Basic Color Correction\\\",\\\"durationHours\\\":4,\\\"startDateTime\\\":\\\"2025-12-30T10:00:00.000Z\\\",\\\"location\\\":\\\"Los Angeles, CA\\\",\\\"guestName\\\":\\\"Test Customer\\\",\\\"guestEmail\\\":\\\"test@example.com\\\",\\\"guestPhone\\\":\\\"+1-555-0123\\\"}\"
      }
    }
  }
}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response Code: ${HTTP_CODE}"
echo "Response Body: ${RESPONSE_BODY}"
echo ""

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ Webhook processed successfully!"
    echo ""
    echo "Check booking status:"
    echo "  curl -s http://localhost:5002/v1/bookings/status/${BOOKING_ID} | jq ."
else
    echo "❌ Webhook failed!"
    echo "Check server logs for details"
fi
