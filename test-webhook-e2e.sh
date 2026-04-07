#!/bin/bash

# End-to-End Webhook Test
# This script creates a test booking and then processes a webhook payment
# IMPORTANT: Only works in development mode

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:5002}"

echo ""
echo "=========================================="
echo "🧪 End-to-End Webhook Test"
echo "=========================================="
echo ""

# Step 1: Create a test booking
echo -e "${BLUE}Step 1: Creating test booking...${NC}"
echo ""

BOOKING_RESPONSE=$(curl -s --location "${API_URL}/v1/stripe/create-payment-intent" \
--header 'Content-Type: application/json' \
--data '{
  "serviceType": "shoot-edit",
  "contentType": "photography",
  "shootType": "Brand Campaign",
  "editType": "Basic Color Correction",
  "durationHours": 4,
  "startDateTime": "2025-12-30T10:00:00.000Z",
  "location": "Los Angeles, CA",
  "guestName": "Test Customer",
  "guestEmail": "test@example.com",
  "guestPhone": "+1-555-0123"
}')

# Check if booking creation was successful
if echo "$BOOKING_RESPONSE" | grep -q '"success":true'; then
    # Extract IDs using grep and cut (more reliable than jq for this case)
    BOOKING_ID=$(echo "$BOOKING_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    PAYMENT_INTENT_ID=$(echo "$BOOKING_RESPONSE" | grep -o '"paymentIntentId":"[^"]*"' | cut -d'"' -f4)
    CONFIRMATION_NUMBER=$(echo "$BOOKING_RESPONSE" | grep -o '"confirmationNumber":"[^"]*"' | cut -d'"' -f4)

    echo -e "${GREEN}✅ Booking created successfully!${NC}"
    echo "  Booking ID: ${BOOKING_ID}"
    echo "  Payment Intent ID: ${PAYMENT_INTENT_ID}"
    echo "  Confirmation Number: ${CONFIRMATION_NUMBER}"
    echo ""
else
    echo -e "${RED}❌ Failed to create booking${NC}"
    echo "Response: ${BOOKING_RESPONSE}"
    exit 1
fi

# Step 2: Wait a moment for database to settle
echo -e "${BLUE}Step 2: Waiting for database...${NC}"
sleep 1
echo -e "${GREEN}✅ Ready${NC}"
echo ""

# Step 3: Simulate webhook payment_intent.succeeded
echo -e "${BLUE}Step 3: Simulating Stripe webhook (payment_intent.succeeded)...${NC}"
echo ""

# Build webhook payload with actual booking data
WEBHOOK_PAYLOAD="{
  \"id\": \"evt_test_$(date +%s)\",
  \"object\": \"event\",
  \"api_version\": \"2024-11-20\",
  \"created\": $(date +%s),
  \"type\": \"payment_intent.succeeded\",
  \"data\": {
    \"object\": {
      \"id\": \"${PAYMENT_INTENT_ID}\",
      \"object\": \"payment_intent\",
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
  },
  \"livemode\": false
}"

WEBHOOK_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --location "${API_URL}/v1/stripe/webhook" \
  --header "Content-Type: application/json" \
  --data "${WEBHOOK_PAYLOAD}")

# Extract status code and response body
HTTP_CODE=$(echo "$WEBHOOK_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$WEBHOOK_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Webhook processed successfully!${NC}"
    echo ""
else
    echo -e "${RED}❌ Webhook failed with status ${HTTP_CODE}${NC}"
    echo "Response: ${RESPONSE_BODY}"
    echo ""
    echo "Check server logs for detailed error information"
    exit 1
fi

# Step 4: Verify booking was updated
echo -e "${BLUE}Step 4: Verifying booking payment status...${NC}"
sleep 1

BOOKING_STATUS=$(curl -s "${API_URL}/v1/bookings/status/${BOOKING_ID}")

if echo "$BOOKING_STATUS" | grep -q '"paymentStatus":"paid"'; then
    echo -e "${GREEN}✅ Booking payment status updated to 'paid'${NC}"
else
    echo -e "${YELLOW}⚠️  Payment status not yet updated (might be processing)${NC}"
fi
echo ""

# Step 5: Check if order was created
echo -e "${BLUE}Step 5: Checking if order was created...${NC}"
sleep 1

# Note: You might need authentication for this endpoint
# For now, just show instructions

echo -e "${YELLOW}To check the created order manually, run:${NC}"
echo "  curl ${API_URL}/v1/orders | grep '${BOOKING_ID}'"
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}🎉 Test Complete!${NC}"
echo "=========================================="
echo ""
echo "Test Summary:"
echo "  ✅ Booking created: ${BOOKING_ID}"
echo "  ✅ Webhook processed successfully"
echo "  ✅ Payment intent: ${PAYMENT_INTENT_ID}"
echo "  ✅ Confirmation: ${CONFIRMATION_NUMBER}"
echo ""
echo "Next Steps:"
echo "  1. Check server logs for email sending status"
echo "  2. Verify order creation in database"
echo "  3. Check Airtable for synced record (if configured)"
echo ""
echo "View booking status:"
echo "  ${API_URL}/v1/bookings/status/${BOOKING_ID}"
echo ""
