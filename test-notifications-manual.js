const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5002/v1/notifications';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTQ4ZmIwZGUzMTYzODlkNThhYmQ0YjUiLCJpYXQiOjE3NjYzOTA1NDIsImV4cCI6MTc2NjM5MjM0MiwidHlwZSI6ImFjY2VzcyJ9.k3V4fb4vxgfIp25XFyI6gXrEDTkG4lwWkgGNDQzaY5A';
const USER_ID = '6948fb0de316389d58abd4b5';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Test results
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

// Notification IDs for later tests
const notifIds = [];

async function testEndpoint(name, method, endpoint, data = null, expectedStatus = 200) {
  totalTests++;
  console.log('\n' + '='.repeat(60));
  console.log(`TEST #${totalTests}: ${name}`);
  console.log(`Method: ${method} ${endpoint}`);

  try {
    let response;
    const url = endpoint;

    if (method === 'GET') {
      response = await api.get(url);
    } else if (method === 'POST') {
      response = await api.post(url, data);
    } else if (method === 'PATCH') {
      response = await api.patch(url, data);
    } else if (method === 'DELETE') {
      response = await api.delete(url);
    }

    const status = response.status;
    console.log(`Status: ${status} (Expected: ${expectedStatus})`);
    console.log(`Response: ${JSON.stringify(response.data).substring(0, 200)}...`);

    const passed = (status === expectedStatus);
    if (passed) {
      console.log('✅ PASSED');
      passedTests++;
    } else {
      console.log('❌ FAILED');
      failedTests++;
    }

    testResults.push({
      name,
      status,
      expected: expectedStatus,
      passed,
      response: response.data
    });

    return response.data;

  } catch (error) {
    const status = error.response?.status || 'ERROR';
    console.log(`Status: ${status} (Expected: ${expectedStatus})`);
    console.log(`Error Code: ${error.code}, Message: ${error.message}`);

    if (error.response) {
      console.log(`Response: ${JSON.stringify(error.response.data).substring(0, 200)}...`);
      const passed = (error.response.status === expectedStatus);
      if (passed) {
        console.log('✅ PASSED');
        passedTests++;
      } else {
        console.log(`❌ FAILED - ${error.message}`);
        failedTests++;
      }
      testResults.push({
        name,
        status: error.response.status,
        expected: expectedStatus,
        passed,
        error: error.response.data
      });
    } else {
      console.log(`❌ FAILED - ${error.message}`);
      failedTests++;
      testResults.push({
        name,
        error: error.message,
        passed: false
      });
    }
    return null;
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('NOTIFICATION API TESTING');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User ID: ${USER_ID}`);

  // ============================================
  // CREATION ENDPOINTS
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('CREATION ENDPOINTS');
  console.log('='.repeat(60));

  // Test 1: Create Notification (New Schema)
  let body = await testEndpoint(
    'Create Notification (New Schema)',
    'POST',
    '/',
    {
      modelName: 'Order',
      modelId: '507f1f77bcf86cd799439011',
      message: 'Test notification - Order created',
      category: 'Order',
      metadata: { orderNumber: '12345' }
    },
    201
  );
  if (body && body._id) {
    notifIds.push(body._id);
    console.log(`✓ Saved Notification ID: ${body._id}`);
  }

  // Test 2: Create Notification (Legacy)
  body = await testEndpoint(
    'Create Notification (Legacy)',
    'POST',
    '/legacy',
    {
      modelName: 'Booking',
      modelId: '507f1f77bcf86cd799439012',
      message: 'Test notification - Booking confirmed',
      category: 'Booking'
    },
    201
  );
  if (body && body._id) {
    notifIds.push(body._id);
    console.log(`✓ Saved Notification ID: ${body._id}`);
  }

  // Test 3-4: Create more notifications
  await testEndpoint(
    'Create Notification #3 (Payment)',
    'POST',
    '/',
    {
      modelName: 'Payment',
      modelId: '507f1f77bcf86cd799439013',
      message: 'Payment received',
      category: 'Payment'
    },
    201
  );

  await testEndpoint(
    'Create Notification #4 (Order Shipped)',
    'POST',
    '/',
    {
      modelName: 'Order',
      modelId: '507f1f77bcf86cd799439011',
      message: 'Order shipped',
      category: 'Order'
    },
    201
  );

  // ============================================
  // QUERY ENDPOINTS
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('QUERY ENDPOINTS');
  console.log('='.repeat(60));

  await testEndpoint(
    'Get All Notifications (paginated)',
    'GET',
    '/?page=1&limit=10&sortBy=createdAt:desc',
    null,
    200
  );

  await testEndpoint(
    'Get My Notifications',
    'GET',
    '/my?page=1&limit=10',
    null,
    200
  );

  await testEndpoint(
    'Get Unread Count',
    'GET',
    '/unread-count',
    null,
    200
  );

  await testEndpoint(
    'Get Notifications by Category (Order)',
    'GET',
    '/category/Order',
    null,
    200
  );

  await testEndpoint(
    'Get Notifications by Model',
    'GET',
    '/model/Order/507f1f77bcf86cd799439011',
    null,
    200
  );

  if (notifIds.length > 0) {
    await testEndpoint(
      'Get Specific Notification by ID',
      'GET',
      `/${notifIds[0]}`,
      null,
      200
    );
  }

  // ============================================
  // UPDATE ENDPOINTS
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('UPDATE ENDPOINTS');
  console.log('='.repeat(60));

  if (notifIds.length > 0) {
    await testEndpoint(
      'Mark Notification as Read',
      'PATCH',
      `/${notifIds[0]}/read`,
      null,
      200
    );
  }

  if (notifIds.length > 1) {
    await testEndpoint(
      'Update Notification',
      'PATCH',
      `/${notifIds[1]}`,
      {
        message: 'Updated: Booking confirmed and ready',
        metadata: { status: 'confirmed', updated: true }
      },
      200
    );
  }

  await testEndpoint(
    'Mark All as Read',
    'PATCH',
    '/mark-all-read',
    {
      userId: USER_ID,
      userRole: 'user'
    },
    200
  );

  // ============================================
  // DELETE ENDPOINTS
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('DELETE ENDPOINTS');
  console.log('='.repeat(60));

  await testEndpoint(
    'Delete Notifications by Model',
    'DELETE',
    '/model/Payment/507f1f77bcf86cd799439013',
    null,
    200
  );

  if (notifIds.length > 1) {
    await testEndpoint(
      'Delete Specific Notification',
      'DELETE',
      `/${notifIds[1]}`,
      null,
      204
    );
  }

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('ERROR HANDLING TESTS');
  console.log('='.repeat(60));

  await testEndpoint(
    'Get Notification with Invalid ID',
    'GET',
    '/invalid-id-format',
    null,
    500
  );

  await testEndpoint(
    'Create Notification Missing Fields',
    'POST',
    '/',
    { message: 'Missing required fields' },
    400
  );

  // Test unauthorized access
  console.log('\n' + '='.repeat(60));
  console.log(`TEST #${totalTests + 1}: Unauthorized Access (No Token)`);
  console.log('Method: GET /my');
  try {
    await axios.get(`${BASE_URL}/my`);
    totalTests++;
    console.log('❌ FAILED - Should have been rejected');
    failedTests++;
  } catch (error) {
    totalTests++;
    if (error.response && error.response.status === 401) {
      console.log('✅ PASSED - Correctly rejected with 401');
      passedTests++;
    } else {
      console.log(`❌ FAILED - Expected 401, got ${error.response?.status || 'ERROR'}`);
      failedTests++;
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${Math.floor(passedTests * 100 / totalTests)}%`);
  console.log('='.repeat(60));

  // Save results
  const fs = require('fs');
  fs.writeFileSync('notification-test-results.json', JSON.stringify({
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      success_rate: `${Math.floor(passedTests * 100 / totalTests)}%`
    },
    tests: testResults
  }, null, 2));

  console.log('\n📄 Detailed results saved to: notification-test-results.json');
}

// Run all tests
runTests().catch(console.error);
