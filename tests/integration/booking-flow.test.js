const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const Booking = require('../../src/models/booking.model');
const User = require('../../src/models/user.model');
const Order = require('../../src/models/order.model');
const { stripeService } = require('../../src/services');

describe('Booking Flow Integration Tests', () => {
  let testUser;
  let authToken;

  beforeEach(async () => {
    // Create a test user for authenticated flows
    testUser = await User.create({
      email: 'testuser@beige.app',
      firstName: 'Test',
      lastName: 'User',
      role: 'client',
      password: 'password123'
    });

    // Generate auth token for authenticated tests
    authToken = testUser.generateAuthToken();
  });

  describe('Guest Booking Flow', () => {
    const guestBookingData = {
      guestName: 'John Doe',
      guestEmail: 'john.doe@test.com',
      guestPhone: '+1234567890',
      serviceType: 'videography',
      contentType: ['video'],
      startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      endDateTime: new Date(Date.now() + 25 * 60 * 60 * 1000), // Tomorrow + 1 hour
      durationHours: 1,
      location: 'Test Studio',
      budget: 150,
      description: 'Test booking for integration tests'
    };

    test('should create a guest booking successfully', async () => {
      const response = await request(app)
        .post('/api/v1/bookings/create')
        .send(guestBookingData)
        .expect(201);

      expect(response.body).toHaveProperty('booking');
      expect(response.body.booking.guestEmail).toBe(guestBookingData.guestEmail);
      expect(response.body.booking.status).toBe('pending');
      expect(response.body.booking.paymentStatus).toBe('pending');
      expect(response.body.booking.userId).toBeNull();

      // Verify booking was saved to database
      const savedBooking = await Booking.findById(response.body.booking.id);
      expect(savedBooking).toBeTruthy();
      expect(savedBooking.guestEmail).toBe(guestBookingData.guestEmail);
    });

    test('should create payment intent for guest booking', async () => {
      // First create a booking
      const bookingResponse = await request(app)
        .post('/api/v1/bookings/create')
        .send(guestBookingData)
        .expect(201);

      const bookingId = bookingResponse.body.booking.id;

      // Mock Stripe payment intent creation
      const mockPaymentIntent = {
        id: 'pi_test_mock_intent',
        client_secret: 'pi_test_mock_intent_secret',
        amount: 15000,
        currency: 'usd'
      };

      jest.spyOn(stripeService, 'createPaymentIntent').mockResolvedValue(mockPaymentIntent);

      // Create payment intent
      const paymentData = {
        ...guestBookingData,
        totalAmount: 150
      };

      const paymentResponse = await request(app)
        .post('/api/v1/stripe/create-payment-intent')
        .send(paymentData)
        .expect(200);

      expect(paymentResponse.body).toHaveProperty('clientSecret');
      expect(paymentResponse.body).toHaveProperty('bookingId');

      // Verify booking was updated with payment intent
      const updatedBooking = await Booking.findById(bookingId);
      expect(updatedBooking.stripePaymentIntentId).toBe(mockPaymentIntent.id);
    });

    test('should handle payment completion via webhook', async () => {
      // Create a booking with payment intent
      const booking = await Booking.create({
        ...guestBookingData,
        stripeSessionId: 'cs_test_mock_session',
        stripePaymentIntentId: 'pi_test_mock_intent'
      });

      // Mock Stripe webhook event
      const webhookEvent = {
        id: 'evt_test_webhook',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_mock_session',
            payment_status: 'paid',
            payment_intent: 'pi_test_mock_intent',
            amount_total: 15000,
            customer_details: {
              email: guestBookingData.guestEmail
            }
          }
        }
      };

      // Mock Stripe webhook verification
      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(webhookEvent)
        .set('stripe-signature', 'test_signature')
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify booking status was updated
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.status).toBe('paid');
      expect(updatedBooking.paymentStatus).toBe('paid');
    });

    test('should convert paid booking to order', async () => {
      // Create a paid booking
      const paidBooking = await Booking.create({
        ...guestBookingData,
        status: 'paid',
        paymentStatus: 'paid',
        totalAmount: 150,
        stripeSessionId: 'cs_test_paid_session'
      });

      const response = await request(app)
        .post('/api/v1/bookings/manual-convert')
        .send({ bookingId: paidBooking._id })
        .expect(200);

      expect(response.body).toHaveProperty('orderId');
      expect(response.body.message).toContain('successfully converted');

      // Verify order was created
      const order = await Order.findById(response.body.orderId);
      expect(order).toBeTruthy();
      expect(order.booking_ref.toString()).toBe(paidBooking._id.toString());
      expect(order.guest_info.email).toBe(guestBookingData.guestEmail);

      // Verify booking was updated
      const updatedBooking = await Booking.findById(paidBooking._id);
      expect(updatedBooking.status).toBe('converted');
      expect(updatedBooking.orderId.toString()).toBe(response.body.orderId);
    });
  });

  describe('Authenticated Booking Flow', () => {
    const authBookingData = {
      guestName: 'Test User',
      guestEmail: 'testuser@beige.app',
      guestPhone: '+1234567890',
      serviceType: 'photography',
      contentType: ['photo'],
      startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endDateTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
      durationHours: 1,
      location: 'Client Location',
      budget: 200,
      description: 'Authenticated user booking test'
    };

    test('should create authenticated booking with userId', async () => {
      const response = await request(app)
        .post('/api/v1/bookings/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(authBookingData)
        .expect(201);

      expect(response.body.booking.userId).toBe(testUser._id.toString());
      expect(response.body.booking.guestEmail).toBe(authBookingData.guestEmail);
      expect(response.body.booking.status).toBe('pending');

      // Verify booking is linked to user
      const savedBooking = await Booking.findById(response.body.booking.id);
      expect(savedBooking.userId.toString()).toBe(testUser._id.toString());
    });

    test('should create payment intent with user context', async () => {
      // Mock Stripe payment intent
      const mockPaymentIntent = {
        id: 'pi_test_auth_intent',
        client_secret: 'pi_test_auth_intent_secret',
        amount: 20000,
        currency: 'usd'
      };

      jest.spyOn(stripeService, 'createPaymentIntent').mockResolvedValue(mockPaymentIntent);

      const paymentData = {
        ...authBookingData,
        totalAmount: 200,
        userId: testUser._id // Should be extracted from token
      };

      const response = await request(app)
        .post('/api/v1/stripe/create-payment-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData)
        .expect(200);

      expect(response.body).toHaveProperty('clientSecret');
      expect(response.body).toHaveProperty('bookingId');

      // Verify booking includes user context
      const booking = await Booking.findById(response.body.bookingId);
      expect(booking.userId.toString()).toBe(testUser._id.toString());
    });

    test('should retrieve user bookings from dashboard', async () => {
      // Create multiple bookings for the user
      const bookings = await Promise.all([
        Booking.create({ ...authBookingData, userId: testUser._id, status: 'confirmed' }),
        Booking.create({ ...authBookingData, userId: testUser._id, status: 'paid' }),
        Booking.create({ ...authBookingData, userId: testUser._id, status: 'pending' })
      ]);

      const response = await request(app)
        .get(`/api/v1/dashboard/client/${testUser._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('orders');
      expect(response.body.orders).toHaveLength(0); // No converted orders yet

      // Should also test booking retrieval endpoint
      const bookingsResponse = await request(app)
        .get('/api/v1/bookings/user')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(bookingsResponse.body.bookings).toHaveLength(3);
      expect(bookingsResponse.body.bookings.every(b => b.userId === testUser._id.toString())).toBe(true);
    });

    test('should convert authenticated booking to order with client_id', async () => {
      // Create paid authenticated booking
      const paidBooking = await Booking.create({
        ...authBookingData,
        userId: testUser._id,
        status: 'paid',
        paymentStatus: 'paid',
        totalAmount: 200
      });

      const response = await request(app)
        .post('/api/v1/bookings/manual-convert')
        .send({ bookingId: paidBooking._id })
        .expect(200);

      // Verify order was created with client_id mapping
      const order = await Order.findById(response.body.orderId);
      expect(order).toBeTruthy();
      expect(order.client_id.toString()).toBe(testUser._id.toString());
      expect(order.booking_ref.toString()).toBe(paidBooking._id.toString());

      // Should appear in user dashboard
      const dashboardResponse = await request(app)
        .get(`/api/v1/dashboard/client/${testUser._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(dashboardResponse.body.orders).toHaveLength(1);
      expect(dashboardResponse.body.orders[0].client_id).toBe(testUser._id.toString());
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle duplicate webhook events (idempotency)', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripeSessionId: 'cs_test_duplicate'
      });

      const webhookEvent = {
        id: 'evt_test_duplicate',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_duplicate',
            payment_status: 'paid'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      // First webhook call
      await request(app)
        .post('/api/v1/stripe/webhook')
        .send(webhookEvent)
        .set('stripe-signature', 'test_signature')
        .expect(200);

      const firstUpdate = await Booking.findById(booking._id);
      expect(firstUpdate.paymentStatus).toBe('paid');

      // Second webhook call (duplicate)
      await request(app)
        .post('/api/v1/stripe/webhook')
        .send(webhookEvent)
        .set('stripe-signature', 'test_signature')
        .expect(200);

      const secondUpdate = await Booking.findById(booking._id);
      expect(secondUpdate.paymentStatus).toBe('paid');
      expect(secondUpdate.updatedAt).toEqual(firstUpdate.updatedAt);
    });

    test('should handle Airtable sync failure gracefully', async () => {
      // Mock Airtable service to fail
      const airtableService = require('../../src/services/airtable.service');
      jest.spyOn(airtableService, 'createRecord').mockRejectedValue(new Error('Airtable API error'));

      const bookingData = testUtils.createTestBooking();

      const response = await request(app)
        .post('/api/v1/bookings/create')
        .send(bookingData)
        .expect(201); // Should still succeed despite Airtable failure

      expect(response.body.booking).toBeTruthy();

      // Verify booking was saved with sync error recorded
      const booking = await Booking.findById(response.body.booking.id);
      expect(booking.syncAttempts.airtable).toBeGreaterThan(0);
      expect(booking.lastSyncError.airtable).toContain('Airtable API error');
    });

    test('should validate booking data and return proper errors', async () => {
      const invalidBookingData = {
        guestName: '',
        guestEmail: 'invalid-email',
        serviceType: 'invalid-service',
        startDateTime: 'invalid-date'
      };

      const response = await request(app)
        .post('/api/v1/bookings/create')
        .send(invalidBookingData)
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toBeInstanceOf(Array);
    });

    test('should handle past booking date validation', async () => {
      const pastBookingData = {
        ...testUtils.createTestBooking(),
        startDateTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        endDateTime: new Date(Date.now() - 23 * 60 * 60 * 1000)
      };

      const response = await request(app)
        .post('/api/v1/bookings/create')
        .send(pastBookingData)
        .expect(400);

      expect(response.body.message).toContain('past');
    });

    test('should handle unauthorized access to protected endpoints', async () => {
      await request(app)
        .get('/api/v1/bookings/user')
        .expect(401);

      await request(app)
        .get(`/api/v1/dashboard/client/${testUser._id}`)
        .expect(401);
    });

    test('should handle booking not found scenarios', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      await request(app)
        .post('/api/v1/bookings/manual-convert')
        .send({ bookingId: nonExistentId })
        .expect(404);

      await request(app)
        .get(`/api/v1/bookings/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle concurrent booking creation', async () => {
      const concurrentBookings = Array.from({ length: 5 }, (_, i) => ({
        ...testUtils.createTestBooking(),
        guestEmail: `concurrent${i}@test.com`,
        startDateTime: new Date(Date.now() + (24 + i) * 60 * 60 * 1000)
      }));

      const promises = concurrentBookings.map(bookingData =>
        request(app)
          .post('/api/v1/bookings/create')
          .send(bookingData)
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.booking).toBeTruthy();
      });

      // Verify all bookings were saved
      const savedBookings = await Booking.find({
        guestEmail: { $regex: /^concurrent\d@test\.com$/ }
      });
      expect(savedBookings).toHaveLength(5);
    });

    test('should handle database connection issues gracefully', async () => {
      // Simulate database disconnection
      await mongoose.connection.close();

      const response = await request(app)
        .post('/api/v1/bookings/create')
        .send(testUtils.createTestBooking())
        .expect(500);

      expect(response.body.message).toContain('service unavailable');

      // Reconnect for other tests
      await mongoose.connect(global.__MONGO_URI__);
    });
  });

  describe('Analytics and Metrics', () => {
    test('should track booking conversion funnel metrics', async () => {
      // Create bookings at different stages
      await Promise.all([
        Booking.create({ ...testUtils.createTestBooking(), status: 'pending' }),
        Booking.create({ ...testUtils.createTestBooking(), status: 'confirmed' }),
        Booking.create({ ...testUtils.createTestBooking(), status: 'paid', paymentStatus: 'paid' }),
        Booking.create({ ...testUtils.createTestBooking(), status: 'converted' })
      ]);

      const stats = await Booking.getStats();

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.paid).toBe(1);
      expect(stats.converted).toBe(1);
    });

    test('should differentiate between guest and authenticated bookings in metrics', async () => {
      await Promise.all([
        Booking.create({ ...testUtils.createTestBooking(), userId: testUser._id }),
        Booking.create({ ...testUtils.createTestBooking(), userId: testUser._id }),
        Booking.create({ ...testUtils.createTestBooking() }), // Guest booking
      ]);

      const stats = await Booking.getStats();

      expect(stats.authenticatedBookings).toBe(2);
      expect(stats.guestBookings).toBe(1);
      expect(stats.total).toBe(3);
    });
  });
});