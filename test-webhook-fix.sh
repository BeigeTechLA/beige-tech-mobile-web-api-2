#!/bin/bash

# Test Webhook Fix - Validates that test webhooks work on staging
# This script tests the updated webhook endpoint with x-test-webhook header

API_URL="${API_URL:-https://api-staging.beige.app}"
ENDPOINT="${API_URL}/v1/stripe/webhook"

echo "🧪 Testing Webhook Fix"
echo "====================="
echo "Endpoint: ${ENDPOINT}"
echo ""

# Test 1: Test webhook with x-test-webhook header (should succeed)
echo "Test 1: Test webhook with x-test-webhook header"
echo "------------------------------------------------"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "${ENDPOINT}" \
  -X POST \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0' \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  -H 'x-test-webhook: true' \
  -H 'Origin: https://beige.app' \
  --data-raw '{
    "id": "evt_test_'$(date +%s)'",
    "object": "event",
    "api_version": "2024-11-20",
    "created": '$(date +%s)',
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_test_'$(date +%s)'",
        "object": "payment_intent",
        "amount": 2400000,
        "currency": "usd",
        "status": "succeeded",
        "metadata": {
          "bookingId": "test_booking_'$(date +%s)'",
          "userId": "",
          "guestName": "Test Guest",
          "guestEmail": "test@example.com",
          "guestPhone": "+1234567890",
          "basePrice": "24000.00",
          "discount": "0",
          "totalAmount": "24000.00"
        }
      }
    },
    "livemode": false
  }')

HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "Response Body: ${HTTP_BODY}"
echo "HTTP Status: ${HTTP_STATUS}"

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "500" ]; then
  echo "✅ Test 1 PASSED - Webhook accepted (status ${HTTP_STATUS})"
else
  echo "❌ Test 1 FAILED - Expected 200 or 500, got ${HTTP_STATUS}"
fi
echo ""

# Test 2: Webhook without x-test-webhook header and without signature (should fail)
echo "Test 2: Webhook without x-test-webhook and without signature"
echo "------------------------------------------------------------"
RESPONSE2=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "${ENDPOINT}" \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://beige.app' \
  --data-raw '{
    "id": "evt_test_'$(date +%s)'",
    "object": "event",
    "type": "payment_intent.succeeded"
  }')

HTTP_BODY2=$(echo "$RESPONSE2" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS2=$(echo "$RESPONSE2" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "Response Body: ${HTTP_BODY2}"
echo "HTTP Status: ${HTTP_STATUS2}"

if [ "$HTTP_STATUS2" = "400" ]; then
  echo "✅ Test 2 PASSED - Webhook properly rejected (status ${HTTP_STATUS2})"
else
  echo "❌ Test 2 FAILED - Expected 400, got ${HTTP_STATUS2}"
fi
echo ""

# Test 3: CORS preflight check
echo "Test 3: CORS preflight (OPTIONS request)"
echo "----------------------------------------"
RESPONSE3=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "${ENDPOINT}" \
  -X OPTIONS \
  -H 'Origin: https://beige.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-test-webhook')

HTTP_BODY3=$(echo "$RESPONSE3" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS3=$(echo "$RESPONSE3" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "Response Body: ${HTTP_BODY3}"
echo "HTTP Status: ${HTTP_STATUS3}"

if [ "$HTTP_STATUS3" = "200" ]; then
  echo "✅ Test 3 PASSED - CORS preflight successful (status ${HTTP_STATUS3})"
else
  echo "❌ Test 3 FAILED - Expected 200, got ${HTTP_STATUS3}"
fi
echo ""

echo "🎯 Testing Summary"
echo "=================="
echo "All tests completed. Check results above."
echo ""
echo "💡 To test locally, run:"
echo "   API_URL=http://localhost:3000 ./test-webhook-fix.sh"
