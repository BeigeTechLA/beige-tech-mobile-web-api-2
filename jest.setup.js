const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const path = require('path');

// Load environment variables for testing
require('dotenv').config({ path: path.join(__dirname, '.env.test') });

let mongoServer;

// Global test setup
beforeAll(async () => {
  // Setup in-memory MongoDB for testing
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // Set global test timeout
  jest.setTimeout(30000);
});

// Global test cleanup
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Clear collections between tests
afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
});

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-super-long-for-security';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing_purposes_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_webhook_secret_for_testing';
process.env.AIRTABLE_API_KEY = 'test_airtable_key_for_testing';
process.env.AIRTABLE_BASE_ID = 'test_base_id_for_testing';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.PORT = '5001';

// Global test utilities
global.testUtils = {
  createTestUser: () => ({
    _id: new mongoose.Types.ObjectId(),
    email: 'test@beige.app',
    firstName: 'Test',
    lastName: 'User',
    role: 'client',
    createdAt: new Date(),
    updatedAt: new Date()
  }),

  createTestBooking: (userId = null) => ({
    userId: userId || new mongoose.Types.ObjectId(),
    serviceName: 'Test Service',
    startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    endDateTime: new Date(Date.now() + 25 * 60 * 60 * 1000), // Tomorrow + 1 hour
    totalPrice: 150,
    guestEmail: 'guest@test.com',
    guestName: 'Guest User',
    guestPhone: '+1234567890',
    status: 'confirmed',
    paymentStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  }),

  createStripeSession: () => ({
    id: 'cs_test_fake_session_id_' + Date.now(),
    payment_status: 'paid',
    customer_details: {
      email: 'test@beige.app'
    },
    amount_total: 15000, // $150.00
    metadata: {
      bookingId: new mongoose.Types.ObjectId().toString()
    }
  }),

  createTestOrder: (clientId = null) => ({
    client_id: clientId || new mongoose.Types.ObjectId(),
    booking_ref: new mongoose.Types.ObjectId(),
    order_status: 'confirmed',
    total_amount: 150,
    guest_info: {
      email: 'guest@test.com',
      name: 'Guest User',
      phone: '+1234567890'
    },
    service_details: {
      name: 'Test Service',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      duration: 60
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }),

  // Mock Stripe webhook event
  createStripeWebhookEvent: (type = 'checkout.session.completed', data = {}) => ({
    id: 'evt_test_' + Date.now(),
    object: 'event',
    api_version: '2020-08-27',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_' + Date.now(),
        object: 'checkout.session',
        payment_status: 'paid',
        ...data
      }
    },
    livemode: false,
    pending_webhooks: 0,
    request: {
      id: 'req_test_' + Date.now(),
      idempotency_key: null
    },
    type
  }),

  // Helper to wait for async operations
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate test data
  generateTestEmail: () => `test.${Date.now()}@beige.app`,

  generateTestPhone: () => `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,

  // Performance testing helpers
  createConcurrentBookings: (count = 10) => {
    return Array.from({ length: count }, (_, i) => ({
      ...global.testUtils.createTestBooking(),
      guestEmail: `guest${i}@test.com`,
      startDateTime: new Date(Date.now() + (24 + i) * 60 * 60 * 1000) // Stagger dates
    }));
  }
};

// Mock external services for testing
jest.mock('../src/services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  constructEvent: jest.fn(),
  retrieveSession: jest.fn()
}));

jest.mock('../src/services/airtable.service', () => ({
  createRecord: jest.fn().mockResolvedValue({ id: 'test_record_id' }),
  updateRecord: jest.fn().mockResolvedValue({ id: 'test_record_id' }),
  syncBookingToAirtable: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('../src/services/email.service', () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue({ messageId: 'test_message_id' }),
  sendBookingReminder: jest.fn().mockResolvedValue({ messageId: 'test_message_id' })
}));

// Console log suppression for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});