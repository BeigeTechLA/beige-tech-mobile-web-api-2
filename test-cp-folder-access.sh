#!/bin/bash

# Test Script for CP Folder Access Control
# This script tests the implementation where CP users can only see folders after accepting orders

echo "=========================================="
echo "CP Folder Access Control - Test Script"
echo "=========================================="
echo ""

# Configuration - UPDATE THESE VALUES
CP_USER_ID="6965cde8c0ecf3be61b70c1a"
ORDER_ID="696f25d39de2079784f5bd47"
CP_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTY1Y2RlOGMwZWNmM2JlNjFiNzBjMWEiLCJpYXQiOjE3Njg4OTE4ODIsImV4cCI6MTc2ODg5MzY4MiwidHlwZSI6ImFjY2VzcyJ9.rMwaYNrfFB3LSfz1tIUVYNC-odOQug265XNNQfGT5QE"
BASE_URL="http://localhost:5002/v1"

echo "Test Configuration:"
echo "  CP User ID: $CP_USER_ID"
echo "  Order ID: $ORDER_ID"
echo "  Base URL: $BASE_URL"
echo ""

# Test 1: Check folders BEFORE accepting order
echo "=========================================="
echo "TEST 1: Check folders BEFORE accepting order"
echo "Expected: Folder should be HIDDEN"
echo "=========================================="
echo ""

echo "Request:"
echo "GET $BASE_URL/gcp/get-files/$CP_USER_ID"
echo ""

response=$(curl -s "$BASE_URL/gcp/get-files/$CP_USER_ID" \
  -H "Authorization: Bearer $CP_TOKEN" \
  -H "Accept: application/json")

echo "Response:"
echo "$response" | jq '.'
echo ""

# Count folders
folder_count=$(echo "$response" | jq '.files | length' 2>/dev/null || echo "0")
echo "📊 Folders visible: $folder_count"
echo ""

if [ "$folder_count" == "0" ] || [ "$folder_count" == "null" ]; then
  echo "✅ TEST 1 PASSED: No folders visible (correct)"
else
  echo "⚠️  TEST 1 WARNING: $folder_count folder(s) visible"
  echo "   (Could be folders from other accepted orders)"
fi
echo ""
echo "Press Enter to continue to Test 2..."
read

# Test 2: CP accepts the order
echo "=========================================="
echo "TEST 2: CP accepts the order"
echo "=========================================="
echo ""

echo "Request:"
echo "PATCH $BASE_URL/orders/$ORDER_ID"
echo "Body: {\"cp_ids\":[{\"id\":\"$CP_USER_ID\",\"decision\":\"accepted\"}]}"
echo ""

accept_response=$(curl -s "$BASE_URL/orders/$ORDER_ID" \
  -X PATCH \
  -H "Authorization: Bearer $CP_TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw "{\"cp_ids\":[{\"id\":\"$CP_USER_ID\",\"decision\":\"accepted\"}]}")

echo "Response:"
echo "$accept_response" | jq '.'
echo ""

# Check if acceptance was successful
acceptance_status=$(echo "$accept_response" | jq -r '.cp_ids[] | select(.id == "'$CP_USER_ID'") | .decision' 2>/dev/null)

if [ "$acceptance_status" == "accepted" ]; then
  echo "✅ Order accepted successfully"
else
  echo "❌ Order acceptance failed or status unclear"
  echo "   Status: $acceptance_status"
fi
echo ""
echo "Press Enter to continue to Test 3..."
read

# Test 3: Check folders AFTER accepting order
echo "=========================================="
echo "TEST 3: Check folders AFTER accepting order"
echo "Expected: Folder should now be VISIBLE"
echo "=========================================="
echo ""

echo "Waiting 2 seconds for database sync..."
sleep 2
echo ""

echo "Request:"
echo "GET $BASE_URL/gcp/get-files/$CP_USER_ID"
echo ""

response_after=$(curl -s "$BASE_URL/gcp/get-files/$CP_USER_ID" \
  -H "Authorization: Bearer $CP_TOKEN" \
  -H "Accept: application/json")

echo "Response:"
echo "$response_after" | jq '.'
echo ""

# Count folders after acceptance
folder_count_after=$(echo "$response_after" | jq '.files | length' 2>/dev/null || echo "0")
echo "📊 Folders visible: $folder_count_after"
echo ""

if [ "$folder_count_after" -gt "0" ]; then
  echo "✅ TEST 3 PASSED: Folder(s) now visible after acceptance"
  
  # Show folder details
  echo ""
  echo "Folder Details:"
  echo "$response_after" | jq '.files[] | {name: .name, path: .path, orderId: .orderId, isFolder: .isFolder}'
else
  echo "❌ TEST 3 FAILED: No folders visible after acceptance"
fi
echo ""

# Test 4: Verify order details in folder metadata
echo "=========================================="
echo "TEST 4: Verify folder metadata contains order ID"
echo "=========================================="
echo ""

folder_order_id=$(echo "$response_after" | jq -r '.files[0].orderId' 2>/dev/null)

if [ "$folder_order_id" == "$ORDER_ID" ]; then
  echo "✅ TEST 4 PASSED: Folder orderId matches accepted order"
  echo "   Folder Order ID: $folder_order_id"
  echo "   Expected: $ORDER_ID"
else
  echo "⚠️  TEST 4 WARNING: Order ID mismatch or not found"
  echo "   Folder Order ID: $folder_order_id"
  echo "   Expected: $ORDER_ID"
fi
echo ""

# Final Summary
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo ""
echo "Test Configuration:"
echo "  CP User ID: $CP_USER_ID"
echo "  Order ID: $ORDER_ID"
echo ""
echo "Results:"
echo "  Test 1 (Before Acceptance): Check response above"
echo "  Test 2 (Acceptance): $acceptance_status"
echo "  Test 3 (After Acceptance): $folder_count_after folder(s) visible"
echo "  Test 4 (Metadata): Order ID match: $([ "$folder_order_id" == "$ORDER_ID" ] && echo 'Yes' || echo 'No')"
echo ""
echo "=========================================="
echo "Test Complete!"
echo "=========================================="
