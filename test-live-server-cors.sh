#!/bin/bash

# Verification Script - Test Current Live Server vs Expected Behavior
# This shows why the fix is needed

echo "═══════════════════════════════════════════════════════════════"
echo "🔍 CORS Issue Analysis - Live Server Testing"
echo "═══════════════════════════════════════════════════════════════"
echo ""

API_URL="https://api-staging.beige.app/v1/stripe/webhook"

# Test 1: Current behavior - WITHOUT Origin header (like your curl)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Current Request (NO Origin header)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Command:"
echo "curl without 'Origin' header (your current request)"
echo ""

RESPONSE1=$(curl -s -i "$API_URL" \
  -H 'Content-Type: application/json' \
  --data-raw '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test"}}}' 2>&1)

echo "Response Headers:"
echo "$RESPONSE1" | grep -E "HTTP|Access-Control"
echo ""
echo "🔍 Analysis: NO 'Access-Control-Allow-Origin' header"
echo "❌ Problem: Browser will block this even though server responds 200 OK"
echo ""

# Test 2: What browser actually sends - WITH Origin header
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Browser Request (WITH Origin header)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Command:"
echo "curl with 'Origin: https://beige.app' header (what browser sends)"
echo ""

RESPONSE2=$(curl -s -i "$API_URL" \
  -H 'Origin: https://beige.app' \
  -H 'Content-Type: application/json' \
  --data-raw '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_test"}}}' 2>&1)

echo "Response Headers:"
echo "$RESPONSE2" | grep -E "HTTP|Access-Control|Origin"
echo ""

if echo "$RESPONSE2" | grep -q "Access-Control-Allow-Origin"; then
    echo "✅ SUCCESS: Has 'Access-Control-Allow-Origin' header"
    echo "✅ Browser will accept this response"
else
    echo "❌ MISSING: NO 'Access-Control-Allow-Origin' header"
    echo "❌ Browser will block this with CORS error"
    echo ""
    echo "⚠️  THIS IS WHY YOUR LIVE SERVER SHOWS CORS ERROR!"
fi
echo ""

# Test 3: OPTIONS preflight (what browser sends first)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: OPTIONS Preflight (Browser's CORS check)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Command:"
echo "curl -X OPTIONS with CORS preflight headers"
echo ""

RESPONSE3=$(curl -s -i -X OPTIONS "$API_URL" \
  -H 'Origin: https://beige.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' 2>&1)

echo "Response Headers:"
echo "$RESPONSE3" | grep -E "HTTP|Access-Control"
echo ""

if echo "$RESPONSE3" | grep -q "Access-Control-Allow-Origin" && echo "$RESPONSE3" | grep -q "200 OK"; then
    echo "✅ SUCCESS: OPTIONS preflight passed"
    echo "✅ Browser will proceed with actual POST request"
else
    echo "❌ FAILED: OPTIONS preflight failed"
    echo "❌ Browser will block the request before POST even happens"
    echo ""
    echo "⚠️  THIS IS THE PRIMARY CORS ISSUE!"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo "📋 SUMMARY"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Current Live Server Status:"
echo ""

if echo "$RESPONSE2" | grep -q "Access-Control-Allow-Origin" && \
   echo "$RESPONSE3" | grep -q "Access-Control-Allow-Origin"; then
    echo "✅ CORS IS WORKING - Fix has been deployed!"
    echo ""
    echo "Your webhook endpoint is now properly configured for:"
    echo "  ✓ Browser-based testing (has CORS headers)"
    echo "  ✓ Real Stripe webhooks (no CORS interference)"
    echo "  ✓ OPTIONS preflight requests"
else
    echo "❌ CORS IS NOT WORKING - Fix NOT deployed yet"
    echo ""
    echo "Required Actions:"
    echo "  1. Deploy the updated code to live server"
    echo "  2. Files to deploy:"
    echo "     - src/app.js"
    echo "     - src/routes/v1/stripe-webhook.route.js"
    echo "     - src/controllers/stripe.controller.js"
    echo "  3. Restart the server"
    echo "  4. Run this script again to verify"
    echo ""
    echo "After deployment, your webhook will:"
    echo "  ✓ Accept requests from browsers (with Origin header)"
    echo "  ✓ Accept requests from Stripe (without Origin header)"
    echo "  ✓ Handle OPTIONS preflight correctly"
    echo "  ✓ No more CORS errors!"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
