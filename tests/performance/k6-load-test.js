import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * K6 Load Testing Script for Beige Booking System
 * Advanced load testing with custom metrics and scenarios
 */

// Custom metrics
const bookingCreationRate = new Rate('booking_creation_success');
const paymentProcessingTime = new Trend('payment_processing_time');
const dashboardLoadTime = new Trend('dashboard_load_time');

// Test configuration
export const options = {
  scenarios: {
    // Ramping load test for booking creation
    booking_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },   // Ramp up to 20 VUs
        { duration: '5m', target: 20 },   // Stay at 20 VUs
        { duration: '2m', target: 50 },   // Ramp up to 50 VUs
        { duration: '5m', target: 50 },   // Stay at 50 VUs
        { duration: '2m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'booking_creation' }
    },

    // Constant load test for authenticated users
    authenticated_users: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
      tags: { test_type: 'authenticated_flow' }
    },

    // Stress test for payment processing
    payment_stress: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 50,
      stages: [
        { duration: '2m', target: 10 },   // 10 req/min
        { duration: '5m', target: 20 },   // 20 req/min
        { duration: '2m', target: 0 },    // 0 req/min
      ],
      tags: { test_type: 'payment_processing' }
    },

    // Spike test for sudden load
    spike_test: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 20,
      maxVUs: 100,
      tags: { test_type: 'spike_test' }
    }
  },

  thresholds: {
    http_req_failed: ['rate<0.1'],       // Error rate < 10%
    http_req_duration: ['p(95)<2000'],   // 95% of requests < 2s
    booking_creation_success: ['rate>0.9'], // 90% success rate
    payment_processing_time: ['p(95)<1000'], // Payment < 1s
    dashboard_load_time: ['p(95)<800'],  // Dashboard < 800ms
  }
};

// Base URLs
const BASE_URL = __ENV.API_URL || 'http://localhost:5001/api/v1';
const FRONTEND_URL = __ENV.FRONTEND_URL || 'http://localhost:3000';

// Test data generators
function generateBookingData() {
  const randomId = Math.floor(Math.random() * 100000);
  const services = ['videography', 'photography', 'editing_only'];
  const contents = ['video', 'photo', 'edit'];
  const locations = ['Studio A', 'Studio B', 'Client Location'];

  const futureDate = new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000);

  return {
    guestName: `K6 Test User ${randomId}`,
    guestEmail: `k6test${randomId}@test.com`,
    guestPhone: `+1555${String(randomId).padStart(6, '0')}`,
    serviceType: services[Math.floor(Math.random() * services.length)],
    contentType: [contents[Math.floor(Math.random() * contents.length)]],
    startDateTime: futureDate.toISOString(),
    endDateTime: new Date(futureDate.getTime() + 60 * 60 * 1000).toISOString(),
    durationHours: Math.ceil(Math.random() * 4),
    location: locations[Math.floor(Math.random() * locations.length)],
    budget: 100 + Math.floor(Math.random() * 500),
    description: `K6 performance test booking ${randomId}`
  };
}

function generatePaymentData() {
  return {
    ...generateBookingData(),
    totalAmount: 100 + Math.floor(Math.random() * 400)
  };
}

// Authentication helper
function authenticateUser() {
  const loginData = {
    email: 'k6test@beige.app',
    password: 'k6TestPassword123'
  };

  const response = http.post(`${BASE_URL}/auth/login`, JSON.stringify(loginData), {
    headers: { 'Content-Type': 'application/json' }
  });

  if (response.status === 200) {
    const body = JSON.parse(response.body);
    return body.tokens.access.token;
  }

  return null;
}

// Test scenarios
export default function () {
  const testType = __ITER % 4; // Rotate through different test types

  switch (testType) {
    case 0:
      testGuestBookingFlow();
      break;
    case 1:
      testAuthenticatedBookingFlow();
      break;
    case 2:
      testPaymentProcessing();
      break;
    case 3:
      testDashboardPerformance();
      break;
  }

  sleep(Math.random() * 2); // Random delay between 0-2 seconds
}

function testGuestBookingFlow() {
  const bookingData = generateBookingData();

  // Create booking
  const createResponse = http.post(
    `${BASE_URL}/bookings/create`,
    JSON.stringify(bookingData),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'booking_creation' }
    }
  );

  const createSuccess = check(createResponse, {
    'booking creation status is 201': (r) => r.status === 201,
    'booking creation response time < 2s': (r) => r.timings.duration < 2000,
    'booking has ID': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.booking && body.booking.id;
      } catch {
        return false;
      }
    }
  });

  bookingCreationRate.add(createSuccess);

  if (createSuccess && createResponse.status === 201) {
    const bookingBody = JSON.parse(createResponse.body);
    const bookingId = bookingBody.booking.id;

    // Test booking retrieval
    const retrieveResponse = http.get(
      `${BASE_URL}/bookings/${bookingId}`,
      {
        tags: { endpoint: 'booking_retrieval' }
      }
    );

    check(retrieveResponse, {
      'booking retrieval status is 200': (r) => r.status === 200,
      'booking data matches': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.booking.guestEmail === bookingData.guestEmail;
        } catch {
          return false;
        }
      }
    });
  }
}

function testAuthenticatedBookingFlow() {
  // Authenticate user
  const token = authenticateUser();

  if (!token) {
    console.log('Authentication failed, skipping authenticated test');
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Create authenticated booking
  const bookingData = generateBookingData();
  const createResponse = http.post(
    `${BASE_URL}/bookings/create`,
    JSON.stringify(bookingData),
    {
      headers: authHeaders,
      tags: { endpoint: 'auth_booking_creation' }
    }
  );

  check(createResponse, {
    'auth booking creation status is 201': (r) => r.status === 201,
    'auth booking has user context': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.booking.userId !== null;
      } catch {
        return false;
      }
    }
  });

  // Test user bookings retrieval
  const userBookingsResponse = http.get(
    `${BASE_URL}/bookings/user`,
    {
      headers: authHeaders,
      tags: { endpoint: 'user_bookings' }
    }
  );

  check(userBookingsResponse, {
    'user bookings status is 200': (r) => r.status === 200,
    'user bookings response time < 1s': (r) => r.timings.duration < 1000,
    'user bookings returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.bookings);
      } catch {
        return false;
      }
    }
  });
}

function testPaymentProcessing() {
  const paymentData = generatePaymentData();

  const startTime = Date.now();

  const paymentResponse = http.post(
    `${BASE_URL}/stripe/create-payment-intent`,
    JSON.stringify(paymentData),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'payment_intent' }
    }
  );

  const paymentTime = Date.now() - startTime;
  paymentProcessingTime.add(paymentTime);

  check(paymentResponse, {
    'payment intent status is 200': (r) => r.status === 200,
    'payment intent has client secret': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.clientSecret && body.clientSecret.startsWith('pi_');
      } catch {
        return false;
      }
    },
    'payment processing time < 1s': (r) => paymentTime < 1000
  });

  // Simulate webhook processing
  if (paymentResponse.status === 200) {
    const paymentBody = JSON.parse(paymentResponse.body);

    const webhookData = {
      id: `evt_test_${Math.random().toString(36).substr(2, 9)}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${Math.random().toString(36).substr(2, 9)}`,
          payment_status: 'paid',
          amount_total: paymentData.totalAmount * 100
        }
      }
    };

    const webhookResponse = http.post(
      `${BASE_URL}/stripe/webhook`,
      JSON.stringify(webhookData),
      {
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'test_signature'
        },
        tags: { endpoint: 'webhook_processing' }
      }
    );

    check(webhookResponse, {
      'webhook processing status is 200': (r) => r.status === 200,
      'webhook processing time < 500ms': (r) => r.timings.duration < 500
    });
  }
}

function testDashboardPerformance() {
  const token = authenticateUser();

  if (!token) {
    console.log('Authentication failed, skipping dashboard test');
    return;
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  const startTime = Date.now();

  // Test dashboard data loading
  const dashboardResponse = http.get(
    `${BASE_URL}/dashboard/client/test-user-id`,
    {
      headers: authHeaders,
      tags: { endpoint: 'dashboard' }
    }
  );

  const dashboardTime = Date.now() - startTime;
  dashboardLoadTime.add(dashboardTime);

  check(dashboardResponse, {
    'dashboard status is 200 or 403': (r) => r.status === 200 || r.status === 403,
    'dashboard load time < 800ms': (r) => dashboardTime < 800
  });

  // Test booking statistics
  const statsResponse = http.get(
    `${BASE_URL}/bookings/stats`,
    {
      headers: authHeaders,
      tags: { endpoint: 'booking_stats' }
    }
  );

  check(statsResponse, {
    'stats status is 200': (r) => r.status === 200,
    'stats response time < 500ms': (r) => r.timings.duration < 500
  });
}

// Setup function (runs once per VU)
export function setup() {
  console.log('Setting up K6 load test...');

  // Create test user for authenticated scenarios
  const testUser = {
    email: 'k6test@beige.app',
    firstName: 'K6',
    lastName: 'Test',
    password: 'k6TestPassword123',
    confirmPassword: 'k6TestPassword123'
  };

  const registerResponse = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify(testUser),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );

  if (registerResponse.status === 201) {
    console.log('Test user created successfully');
  } else {
    console.log('Test user may already exist, continuing...');
  }

  return { testUserId: 'k6-test-user-id' };
}

// Teardown function (runs once after all VUs complete)
export function teardown(data) {
  console.log('K6 load test completed');
  console.log('Check the generated report for detailed metrics');
}

// Handle summary (custom report generation)
export function handleSummary(data) {
  const report = {
    testDuration: data.metrics.iteration_duration.values.avg,
    totalRequests: data.metrics.http_reqs.values.count,
    failedRequests: data.metrics.http_req_failed.values.rate,
    avgResponseTime: data.metrics.http_req_duration.values.avg,
    p95ResponseTime: data.metrics.http_req_duration.values['p(95)'],
    bookingCreationSuccess: data.metrics.booking_creation_success?.values.rate || 0,
    avgPaymentProcessingTime: data.metrics.payment_processing_time?.values.avg || 0,
    avgDashboardLoadTime: data.metrics.dashboard_load_time?.values.avg || 0
  };

  console.log('\n=== K6 LOAD TEST SUMMARY ===');
  console.log(`Total Requests: ${report.totalRequests}`);
  console.log(`Failed Requests: ${(report.failedRequests * 100).toFixed(2)}%`);
  console.log(`Average Response Time: ${report.avgResponseTime.toFixed(2)}ms`);
  console.log(`95th Percentile Response Time: ${report.p95ResponseTime.toFixed(2)}ms`);
  console.log(`Booking Creation Success Rate: ${(report.bookingCreationSuccess * 100).toFixed(2)}%`);
  console.log(`Average Payment Processing Time: ${report.avgPaymentProcessingTime.toFixed(2)}ms`);
  console.log(`Average Dashboard Load Time: ${report.avgDashboardLoadTime.toFixed(2)}ms`);

  return {
    'stdout': JSON.stringify(report, null, 2),
    'summary.json': JSON.stringify(data, null, 2)
  };
}