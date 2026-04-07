#!/bin/bash

# CORS Testing Script for Stripe Webhook Endpoint
# This script tests the webhook endpoint from different scenarios

echo "========================================="
echo "🧪 Testing Stripe Webhook CORS Configuration"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="https://api-staging.beige.app/v1/stripe/webhook"
TEST_PAYLOAD='{
  "id": "evt_test_cors_'$(date +%s)'",
  "object": "event",
  "api_version": "2024-11-20",
  "created": '$(date +%s)',
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_test_cors_'$(date +%s)'",
      "object": "payment_intent",
      "amount": 1800000,
      "currency": "usd",
      "status": "succeeded",
      "metadata": {
        "bookingId": "695b4937d8a7176678afbad4",
        "userId": "664edf60caef2c061f6117ff",
        "guestName": "CORS Test",
        "guestEmail": "test@beige.app",
        "guestPhone": "",
        "basePrice": "18000.00",
        "discount": "0",
        "totalAmount": "18000.00"
      }
    }
  },
  "livemode": false
}'

echo "📍 Target URL: $API_URL"
echo ""

# Test 1: OPTIONS Preflight Request
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: CORS Preflight (OPTIONS) Request"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing if server responds to OPTIONS preflight..."
echo ""

PREFLIGHT_RESPONSE=$(curl -i -X OPTIONS "$API_URL" \
  -H "Origin: https://beige.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  -s)

echo "$PREFLIGHT_RESPONSE"
echo ""

if echo "$PREFLIGHT_RESPONSE" | grep -q "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}✅ PASS: CORS headers present in preflight response${NC}"
else
    echo -e "${RED}❌ FAIL: Missing CORS headers in preflight response${NC}"
fi
echo ""

# Test 2: POST Request with Origin Header (Browser simulation)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: POST Request with Origin (Browser)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Simulating browser request from https://beige.app..."
echo ""

BROWSER_RESPONSE=$(curl -i -X POST "$API_URL" \
  -H "Origin: https://beige.app" \
  -H "Content-Type: application/json" \
  -H "Referer: https://beige.app/" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -d "$TEST_PAYLOAD" \
  -s)

echo "$BROWSER_RESPONSE"
echo ""

if echo "$BROWSER_RESPONSE" | grep -q "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}✅ PASS: CORS headers present in POST response${NC}"
else
    echo -e "${RED}❌ FAIL: Missing CORS headers in POST response${NC}"
fi

if echo "$BROWSER_RESPONSE" | grep -q "200 OK\|received.*true"; then
    echo -e "${GREEN}✅ PASS: Webhook processed successfully${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: Webhook may not have been processed successfully${NC}"
fi
echo ""

# Test 3: POST Request without Origin (Server-to-server)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 3: POST Request without Origin (Server)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Simulating server-to-server request (no origin header)..."
echo ""

SERVER_RESPONSE=$(curl -i -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD" \
  -s)

echo "$SERVER_RESPONSE"
echo ""

if echo "$SERVER_RESPONSE" | grep -q "200 OK\|received.*true"; then
    echo -e "${GREEN}✅ PASS: Server-to-server webhook works${NC}"
else
    echo -e "${RED}❌ FAIL: Server-to-server webhook failed${NC}"
fi
echo ""

# Test 4: Your exact curl command
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 4: Your Original Curl Command"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing with your exact parameters..."
echo ""

ORIGINAL_RESPONSE=$(curl -i 'https://api-staging.beige.app/v1/stripe/webhook' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'Referer: https://beige.app/' \
  -H 'Origin: https://beige.app' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36' \
  -H 'sec-ch-ua: "Brave";v="143", "Chromium";v="143", "Not A(Brand";v="24"' \
  -H 'Content-Type: application/json' \
  -H 'sec-ch-ua-mobile: ?0' \
  --data-raw '{"id":"evt_success_page_1767590251162","object":"event","api_version":"2024-11-20","created":1767590251,"type":"payment_intent.succeeded","data":{"object":{"id":"pi_3Sm69zRqRk5aIfw0088e0TW4","object":"payment_intent","amount":1800000,"currency":"usd","status":"succeeded","metadata":{"bookingId":"695b4937d8a7176678afbad4","userId":"664edf60caef2c061f6117ff","guestName":"Guest","guestEmail":"","guestPhone":"","basePrice":"18000.00","discount":"0","totalAmount":"18000.00"}}},"livemode":false}' \
  -s)

echo "$ORIGINAL_RESPONSE"
echo ""

if echo "$ORIGINAL_RESPONSE" | grep -q "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}✅ PASS: Your original request now works with CORS${NC}"
else
    echo -e "${RED}❌ FAIL: CORS issue still present${NC}"
fi
echo ""

# Summary
echo "========================================="
echo "📊 Test Summary"
echo "========================================="
echo ""
echo "All tests completed. Check results above."
echo ""
echo "🔍 Key CORS Headers to Look For:"
echo "  - Access-Control-Allow-Origin: https://beige.app"
echo "  - Access-Control-Allow-Methods: POST, OPTIONS, etc."
echo "  - Access-Control-Allow-Headers: content-type, stripe-signature, etc."
echo ""
echo "✅ If all tests pass, CORS is properly configured!"
echo ""


