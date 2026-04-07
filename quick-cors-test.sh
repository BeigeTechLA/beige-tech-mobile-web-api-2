#!/bin/bash

# Quick CORS Test for Webhook Endpoint
# Run this to verify CORS fix is working

API_URL="${API_URL:-https://api-staging.beige.app}"

echo "🧪 Testing Webhook CORS Fix..."
echo "Target: ${API_URL}/v1/stripe/webhook"
echo ""

# Test 1: OPTIONS Preflight
echo "Test 1: OPTIONS Preflight (Browser CORS check)..."
curl -X OPTIONS "${API_URL}/v1/stripe/webhook" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: stripe-signature" \
  -i -s | grep -E "HTTP|Access-Control"
echo ""

# Test 2: POST with Origin
echo "Test 2: POST with Origin (Browser test mode)..."
curl -X POST "${API_URL}/v1/stripe/webhook" \
  -H "Content-Type: application/json" \
  -H "Origin: https://example.com" \
  -d '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test"}}}' \
  -i -s | grep -E "HTTP|Access-Control|received"
echo ""

# Test 3: POST without Origin
echo "Test 3: POST without Origin (Real Stripe webhook)..."
curl -X POST "${API_URL}/v1/stripe/webhook" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=123,v1=test" \
  -d '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test"}}}' \
  -i -s | grep -E "HTTP|Access-Control|Webhook Error"
echo ""

echo "✅ Tests complete! Check output above."
