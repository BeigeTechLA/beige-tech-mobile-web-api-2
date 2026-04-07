const autocannon = require('autocannon');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../src/models/user.model');
const Booking = require('../../src/models/booking.model');
const app = require('../../src/app');

/**
 * Performance Test Suite for Authenticated Checkout System
 * Tests API endpoints under various load conditions
 */

let mongoServer;
let testUsers = [];
let testTokens = [];

// Performance test configuration
const PERFORMANCE_CONFIG = {
  duration: process.env.PERFORMANCE_TEST_DURATION || 30, // seconds
  connections: process.env.PERFORMANCE_TEST_CONNECTIONS || 50,
  rate: process.env.PERFORMANCE_TEST_RATE || 10, // requests per second
  baseURL: process.env.API_URL || 'http://localhost:5001/api/v1',
  thresholds: {
    avgLatency: 500, // ms
    p95Latency: 1000, // ms
    errorRate: 0.01, // 1%
    throughput: 100 // requests per second
  }
};

/**
 * Setup performance test environment
 */
async function setupPerformanceTests() {
  console.log('🚀 Setting up performance test environment...');

  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // Create test users for authenticated endpoints
  for (let i = 0; i < 10; i++) {
    const user = await User.create({
      email: `perftest${i}@beige.app`,
      firstName: `PerfTest${i}`,
      lastName: 'User',
      password: 'perfTestPassword123',
      role: 'client',
      isEmailVerified: true
    });

    testUsers.push(user);
    testTokens.push(user.generateAuthToken());
  }

  // Create some existing bookings for dashboard tests
  for (let i = 0; i < 50; i++) {
    await Booking.create({
      userId: testUsers[i % testUsers.length]._id,
      guestName: `Perf Test Booking ${i}`,
      guestEmail: `perfbooking${i}@test.com`,
      guestPhone: `+155500${String(i).padStart(4, '0')}`,
      serviceType: ['videography', 'photography', 'editing_only'][i % 3],
      contentType: ['video', 'photo', 'edit'][i % 3],
      startDateTime: new Date(Date.now() + (i * 24 * 60 * 60 * 1000)),
      endDateTime: new Date(Date.now() + (i * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)),
      durationHours: Math.ceil(Math.random() * 4),
      location: `Performance Test Location ${i}`,
      budget: 100 + (i * 10),
      status: ['pending', 'confirmed', 'paid', 'converted'][i % 4],
      paymentStatus: ['pending', 'paid', 'failed'][i % 3],
      totalAmount: 100 + (i * 10)
    });
  }

  console.log(`✅ Created ${testUsers.length} test users and 50 test bookings`);
}

/**
 * Cleanup performance test environment
 */
async function cleanupPerformanceTests() {
  console.log('🧹 Cleaning up performance test environment...');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Generate random booking data for load testing
 */
function generateBookingData() {
  const services = ['videography', 'photography', 'editing_only'];
  const contents = ['video', 'photo', 'edit'];
  const locations = ['Studio A', 'Studio B', 'Client Location', 'Outdoor Location'];

  const randomId = Math.floor(Math.random() * 10000);
  const futureDate = new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000);

  return {
    guestName: `Load Test User ${randomId}`,
    guestEmail: `loadtest${randomId}@test.com`,
    guestPhone: `+1555${String(randomId).padStart(6, '0')}`,
    serviceType: services[Math.floor(Math.random() * services.length)],
    contentType: [contents[Math.floor(Math.random() * contents.length)]],
    startDateTime: futureDate,
    endDateTime: new Date(futureDate.getTime() + 60 * 60 * 1000),
    durationHours: Math.ceil(Math.random() * 4),
    location: locations[Math.floor(Math.random() * locations.length)],
    budget: 100 + Math.floor(Math.random() * 500),
    description: `Performance test booking ${randomId}`
  };
}

/**
 * Test booking creation endpoint performance
 */
async function testBookingCreation() {
  console.log('📊 Testing booking creation performance...');

  const result = await autocannon({
    url: `${PERFORMANCE_CONFIG.baseURL}/bookings/create`,
    connections: PERFORMANCE_CONFIG.connections,
    duration: PERFORMANCE_CONFIG.duration,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(generateBookingData()),
    requests: [
      {
        method: 'POST',
        path: '/bookings/create',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(generateBookingData())
      }
    ]
  });

  return {
    name: 'Booking Creation',
    ...result,
    passed: result.latency.average <= PERFORMANCE_CONFIG.thresholds.avgLatency &&
            result.latency.p95 <= PERFORMANCE_CONFIG.thresholds.p95Latency &&
            (result.errors / result.requests.total) <= PERFORMANCE_CONFIG.thresholds.errorRate
  };
}

/**
 * Test authenticated user bookings retrieval performance
 */
async function testUserBookingsRetrieval() {
  console.log('📊 Testing user bookings retrieval performance...');

  const requests = testTokens.map((token, index) => ({
    method: 'GET',
    path: '/bookings/user',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }));

  const result = await autocannon({
    url: `${PERFORMANCE_CONFIG.baseURL}/bookings/user`,
    connections: Math.min(PERFORMANCE_CONFIG.connections, testTokens.length),
    duration: PERFORMANCE_CONFIG.duration,
    requests: requests
  });

  return {
    name: 'User Bookings Retrieval',
    ...result,
    passed: result.latency.average <= PERFORMANCE_CONFIG.thresholds.avgLatency &&
            result.latency.p95 <= PERFORMANCE_CONFIG.thresholds.p95Latency &&
            (result.errors / result.requests.total) <= PERFORMANCE_CONFIG.thresholds.errorRate
  };
}

/**
 * Test dashboard performance under load
 */
async function testDashboardPerformance() {
  console.log('📊 Testing dashboard performance...');

  const requests = testTokens.map((token, index) => ({
    method: 'GET',
    path: `/dashboard/client/${testUsers[index]._id}`,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }));

  const result = await autocannon({
    url: `${PERFORMANCE_CONFIG.baseURL}/dashboard/client/${testUsers[0]._id}`,
    connections: Math.min(PERFORMANCE_CONFIG.connections, testTokens.length),
    duration: PERFORMANCE_CONFIG.duration,
    requests: requests
  });

  return {
    name: 'Dashboard Performance',
    ...result,
    passed: result.latency.average <= PERFORMANCE_CONFIG.thresholds.avgLatency &&
            result.latency.p95 <= PERFORMANCE_CONFIG.thresholds.p95Latency &&
            (result.errors / result.requests.total) <= PERFORMANCE_CONFIG.thresholds.errorRate
  };
}

/**
 * Test payment intent creation performance
 */
async function testPaymentIntentCreation() {
  console.log('📊 Testing payment intent creation performance...');

  // Mock Stripe service for performance testing
  const stripeService = require('../../src/services/stripe.service');
  const originalCreatePaymentIntent = stripeService.createPaymentIntent;

  stripeService.createPaymentIntent = jest.fn().mockResolvedValue({
    id: 'pi_test_performance',
    client_secret: 'pi_test_performance_secret',
    amount: 15000,
    currency: 'usd'
  });

  const paymentData = {
    ...generateBookingData(),
    totalAmount: 150
  };

  const result = await autocannon({
    url: `${PERFORMANCE_CONFIG.baseURL}/stripe/create-payment-intent`,
    connections: PERFORMANCE_CONFIG.connections,
    duration: PERFORMANCE_CONFIG.duration,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(paymentData)
  });

  // Restore original function
  stripeService.createPaymentIntent = originalCreatePaymentIntent;

  return {
    name: 'Payment Intent Creation',
    ...result,
    passed: result.latency.average <= PERFORMANCE_CONFIG.thresholds.avgLatency &&
            result.latency.p95 <= PERFORMANCE_CONFIG.thresholds.p95Latency &&
            (result.errors / result.requests.total) <= PERFORMANCE_CONFIG.thresholds.errorRate
  };
}

/**
 * Test concurrent booking creation stress
 */
async function testConcurrentBookingStress() {
  console.log('📊 Testing concurrent booking creation stress...');

  const highLoadConfig = {
    ...PERFORMANCE_CONFIG,
    connections: 100,
    duration: 60,
    rate: 50
  };

  const result = await autocannon({
    url: `${highLoadConfig.baseURL}/bookings/create`,
    connections: highLoadConfig.connections,
    duration: highLoadConfig.duration,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(generateBookingData()),
    requests: Array.from({ length: 10 }, () => ({
      method: 'POST',
      path: '/bookings/create',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(generateBookingData())
    }))
  });

  return {
    name: 'Concurrent Booking Stress Test',
    ...result,
    passed: result.latency.average <= (PERFORMANCE_CONFIG.thresholds.avgLatency * 2) &&
            result.latency.p95 <= (PERFORMANCE_CONFIG.thresholds.p95Latency * 2) &&
            (result.errors / result.requests.total) <= (PERFORMANCE_CONFIG.thresholds.errorRate * 2)
  };
}

/**
 * Test webhook processing performance
 */
async function testWebhookProcessing() {
  console.log('📊 Testing webhook processing performance...');

  // Create bookings first for webhook processing
  const testBookings = [];
  for (let i = 0; i < 20; i++) {
    const booking = await Booking.create({
      ...generateBookingData(),
      stripeSessionId: `cs_test_performance_${i}`,
      status: 'confirmed',
      paymentStatus: 'pending'
    });
    testBookings.push(booking);
  }

  const webhookEvents = testBookings.map((booking, i) => ({
    method: 'POST',
    path: '/stripe/webhook',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': 'test_signature'
    },
    body: JSON.stringify({
      id: `evt_test_performance_${i}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: booking.stripeSessionId,
          payment_status: 'paid'
        }
      }
    })
  }));

  // Mock Stripe webhook verification
  const stripeService = require('../../src/services/stripe.service');
  const originalConstructEvent = stripeService.constructEvent;

  stripeService.constructEvent = jest.fn().mockImplementation((body) => {
    return JSON.parse(body);
  });

  const result = await autocannon({
    url: `${PERFORMANCE_CONFIG.baseURL}/stripe/webhook`,
    connections: Math.min(PERFORMANCE_CONFIG.connections, webhookEvents.length),
    duration: PERFORMANCE_CONFIG.duration,
    requests: webhookEvents
  });

  // Restore original function
  stripeService.constructEvent = originalConstructEvent;

  return {
    name: 'Webhook Processing',
    ...result,
    passed: result.latency.average <= PERFORMANCE_CONFIG.thresholds.avgLatency &&
            result.latency.p95 <= PERFORMANCE_CONFIG.thresholds.p95Latency &&
            (result.errors / result.requests.total) <= PERFORMANCE_CONFIG.thresholds.errorRate
  };
}

/**
 * Test database query performance under load
 */
async function testDatabaseQueryPerformance() {
  console.log('📊 Testing database query performance...');

  const startTime = Date.now();
  const queries = [];

  // Test various query patterns
  for (let i = 0; i < 1000; i++) {
    queries.push(
      Booking.find({ userId: testUsers[i % testUsers.length]._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    );
  }

  const results = await Promise.all(queries);
  const endTime = Date.now();

  const avgQueryTime = (endTime - startTime) / queries.length;

  return {
    name: 'Database Query Performance',
    totalQueries: queries.length,
    totalTime: endTime - startTime,
    averageQueryTime: avgQueryTime,
    passed: avgQueryTime <= 50 // 50ms average query time threshold
  };
}

/**
 * Generate performance test report
 */
function generatePerformanceReport(results) {
  console.log('\n📈 PERFORMANCE TEST RESULTS\n');
  console.log('=' .repeat(80));

  let allPassed = true;

  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${status} ${result.name}`);

    if (result.requests) {
      console.log(`  Requests: ${result.requests.total}`);
      console.log(`  Throughput: ${result.requests.average}/sec`);
      console.log(`  Latency (avg): ${result.latency.average}ms`);
      console.log(`  Latency (p95): ${result.latency.p95}ms`);
      console.log(`  Errors: ${result.errors} (${((result.errors / result.requests.total) * 100).toFixed(2)}%)`);
    } else if (result.totalQueries) {
      console.log(`  Total Queries: ${result.totalQueries}`);
      console.log(`  Total Time: ${result.totalTime}ms`);
      console.log(`  Average Query Time: ${result.averageQueryTime.toFixed(2)}ms`);
    }

    if (!result.passed) {
      allPassed = false;
      console.log(`  ⚠️  Failed to meet performance thresholds`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log(`\nOVERALL RESULT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  if (!allPassed) {
    console.log('\n🔧 RECOMMENDATIONS:');
    console.log('- Review database indexes and query optimization');
    console.log('- Implement Redis caching for frequently accessed data');
    console.log('- Consider connection pooling and load balancing');
    console.log('- Monitor memory usage and garbage collection');
    console.log('- Implement API rate limiting and throttling');
  }

  return allPassed;
}

/**
 * Main performance test runner
 */
async function runPerformanceTests() {
  try {
    await setupPerformanceTests();

    const results = [];

    // Run all performance tests
    results.push(await testBookingCreation());
    results.push(await testUserBookingsRetrieval());
    results.push(await testDashboardPerformance());
    results.push(await testPaymentIntentCreation());
    results.push(await testWebhookProcessing());
    results.push(await testConcurrentBookingStress());
    results.push(await testDatabaseQueryPerformance());

    const allPassed = generatePerformanceReport(results);

    await cleanupPerformanceTests();

    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('❌ Performance test error:', error);
    await cleanupPerformanceTests();
    process.exit(1);
  }
}

// Run performance tests if called directly
if (require.main === module) {
  runPerformanceTests();
}

module.exports = {
  runPerformanceTests,
  testBookingCreation,
  testUserBookingsRetrieval,
  testDashboardPerformance,
  testPaymentIntentCreation,
  testWebhookProcessing,
  testConcurrentBookingStress,
  testDatabaseQueryPerformance
};