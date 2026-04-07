const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/user.model');
const Booking = require('../../src/models/booking.model');
const Order = require('../../src/models/order.model');

describe('Authentication Integration with Booking System', () => {
  let testUser;
  let guestUser;
  let authToken;

  beforeEach(async () => {
    // Create test users
    testUser = await User.create({
      email: 'authenticated@beige.app',
      firstName: 'Auth',
      lastName: 'User',
      role: 'client',
      password: 'securePassword123',
      isEmailVerified: true
    });

    guestUser = {
      email: 'guest@beige.app',
      firstName: 'Guest',
      lastName: 'User'
    };

    // Generate auth token
    authToken = testUser.generateAuthToken();
  });

  describe('User Registration During Booking Flow', () => {
    const bookingData = {
      guestName: 'New User',
      guestEmail: 'newuser@beige.app',
      guestPhone: '+1234567890',
      serviceType: 'videography',
      contentType: ['video'],
      startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endDateTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
      durationHours: 1,
      location: 'Test Location',
      budget: 200,
      description: 'Test booking for new user registration'
    };

    test('should allow guest to create booking and register during checkout', async () => {
      // Step 1: Create guest booking
      const bookingResponse = await request(app)
        .post('/api/v1/bookings/create')
        .send(bookingData)
        .expect(201);

      const bookingId = bookingResponse.body.booking.id;
      expect(bookingResponse.body.booking.userId).toBeNull();

      // Step 2: Register user during checkout
      const registrationData = {
        email: bookingData.guestEmail,
        firstName: 'New',
        lastName: 'User',
        password: 'newUserPassword123',
        confirmPassword: 'newUserPassword123'
      };

      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send(registrationData)
        .expect(201);

      expect(registerResponse.body.user.email).toBe(bookingData.guestEmail);
      const newUserToken = registerResponse.body.tokens.access.token;

      // Step 3: Link booking to newly registered user
      const linkResponse = await request(app)
        .patch(`/api/v1/bookings/${bookingId}/link-user`)
        .set('Authorization', `Bearer ${newUserToken}`)
        .expect(200);

      expect(linkResponse.body.booking.userId).toBe(registerResponse.body.user.id);

      // Verify booking is now linked to user
      const updatedBooking = await Booking.findById(bookingId);
      expect(updatedBooking.userId.toString()).toBe(registerResponse.body.user.id);
    });

    test('should handle email conflict during registration', async () => {
      // Create booking with existing user email
      const conflictBookingData = {
        ...bookingData,
        guestEmail: testUser.email
      };

      const bookingResponse = await request(app)
        .post('/api/v1/bookings/create')
        .send(conflictBookingData)
        .expect(201);

      // Try to register with existing email
      const registrationData = {
        email: testUser.email,
        firstName: 'Conflict',
        lastName: 'User',
        password: 'conflictPassword123',
        confirmPassword: 'conflictPassword123'
      };

      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send(registrationData)
        .expect(400);

      expect(registerResponse.body.message).toContain('already taken');
    });

    test('should allow existing user to login and claim guest booking', async () => {
      // Create booking with existing user's email as guest
      const existingUserBookingData = {
        ...bookingData,
        guestEmail: testUser.email,
        guestName: testUser.firstName + ' ' + testUser.lastName
      };

      const bookingResponse = await request(app)
        .post('/api/v1/bookings/create')
        .send(existingUserBookingData)
        .expect(201);

      const bookingId = bookingResponse.body.booking.id;

      // User logs in
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'securePassword123'
        })
        .expect(200);

      const loginToken = loginResponse.body.tokens.access.token;

      // Claim the guest booking
      const claimResponse = await request(app)
        .patch(`/api/v1/bookings/${bookingId}/claim`)
        .set('Authorization', `Bearer ${loginToken}`)
        .expect(200);

      expect(claimResponse.body.booking.userId).toBe(testUser._id.toString());

      // Verify booking is now linked
      const claimedBooking = await Booking.findById(bookingId);
      expect(claimedBooking.userId.toString()).toBe(testUser._id.toString());
    });
  });

  describe('Authenticated User Booking Flow', () => {
    test('should create booking with user context from JWT token', async () => {
      const authBookingData = {
        guestName: testUser.firstName + ' ' + testUser.lastName,
        guestEmail: testUser.email,
        guestPhone: '+1234567890',
        serviceType: 'photography',
        contentType: ['photo'],
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endDateTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
        durationHours: 1,
        location: 'Studio Location',
        budget: 300
      };

      const response = await request(app)
        .post('/api/v1/bookings/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(authBookingData)
        .expect(201);

      expect(response.body.booking.userId).toBe(testUser._id.toString());
      expect(response.body.booking.guestEmail).toBe(testUser.email);

      // Verify user context is properly set
      const savedBooking = await Booking.findById(response.body.booking.id);
      expect(savedBooking.userId.toString()).toBe(testUser._id.toString());
    });

    test('should retrieve user bookings with proper authorization', async () => {
      // Create multiple bookings for the user
      const userBookings = await Promise.all([
        Booking.create({
          ...testUtils.createTestBooking(),
          userId: testUser._id,
          guestEmail: testUser.email,
          status: 'confirmed'
        }),
        Booking.create({
          ...testUtils.createTestBooking(),
          userId: testUser._id,
          guestEmail: testUser.email,
          status: 'paid'
        })
      ]);

      // Create a booking for another user (should not be returned)
      const otherUser = await User.create({
        email: 'other@beige.app',
        firstName: 'Other',
        lastName: 'User',
        password: 'otherPassword123'
      });

      await Booking.create({
        ...testUtils.createTestBooking(),
        userId: otherUser._id,
        guestEmail: otherUser.email
      });

      const response = await request(app)
        .get('/api/v1/bookings/user')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.bookings).toHaveLength(2);
      response.body.bookings.forEach(booking => {
        expect(booking.userId).toBe(testUser._id.toString());
      });
    });

    test('should deny access to unauthorized booking endpoints', async () => {
      // Try to access user bookings without token
      await request(app)
        .get('/api/v1/bookings/user')
        .expect(401);

      // Try to access user bookings with invalid token
      await request(app)
        .get('/api/v1/bookings/user')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      // Try to access another user's dashboard
      const otherUser = await User.create({
        email: 'unauthorized@beige.app',
        firstName: 'Unauthorized',
        lastName: 'User',
        password: 'password123'
      });

      await request(app)
        .get(`/api/v1/dashboard/client/${otherUser._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403); // Forbidden - can't access other user's data
    });
  });

  describe('Dashboard Integration with Authentication', () => {
    test('should display user orders in authenticated dashboard', async () => {
      // Create booking and convert to order
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        userId: testUser._id,
        guestEmail: testUser.email,
        status: 'paid',
        paymentStatus: 'paid',
        totalAmount: 250
      });

      const order = await Order.create({
        ...testUtils.createTestOrder(testUser._id),
        booking_ref: booking._id,
        client_id: testUser._id,
        total_amount: 250
      });

      // Update booking with order reference
      booking.orderId = order._id;
      booking.status = 'converted';
      await booking.save();

      const response = await request(app)
        .get(`/api/v1/dashboard/client/${testUser._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].client_id).toBe(testUser._id.toString());
      expect(response.body.orders[0].booking_ref).toBe(booking._id.toString());
    });

    test('should show booking history for authenticated users', async () => {
      // Create multiple bookings at different stages
      const bookings = await Promise.all([
        Booking.create({
          ...testUtils.createTestBooking(),
          userId: testUser._id,
          status: 'pending',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
        }),
        Booking.create({
          ...testUtils.createTestBooking(),
          userId: testUser._id,
          status: 'confirmed',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
        }),
        Booking.create({
          ...testUtils.createTestBooking(),
          userId: testUser._id,
          status: 'paid',
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
        })
      ]);

      const response = await request(app)
        .get('/api/v1/bookings/user/history')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10, page: 1 })
        .expect(200);

      expect(response.body.bookings).toHaveLength(3);
      expect(response.body.pagination.total).toBe(3);

      // Should be sorted by creation date (newest first)
      const receivedBookings = response.body.bookings;
      expect(new Date(receivedBookings[0].createdAt)).toBeInstanceOf(Date);
      expect(new Date(receivedBookings[0].createdAt).getTime()).toBeGreaterThan(
        new Date(receivedBookings[1].createdAt).getTime()
      );
    });

    test('should allow authenticated users to manage their bookings', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        userId: testUser._id,
        status: 'confirmed',
        startDateTime: new Date(Date.now() + 48 * 60 * 60 * 1000) // 2 days from now
      });

      // User should be able to cancel their own booking
      const cancelResponse = await request(app)
        .patch(`/api/v1/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cancellationReason: 'Change of plans' })
        .expect(200);

      expect(cancelResponse.body.booking.status).toBe('cancelled');

      // Verify booking was cancelled
      const cancelledBooking = await Booking.findById(booking._id);
      expect(cancelledBooking.status).toBe('cancelled');
    });

    test('should prevent users from managing other users\' bookings', async () => {
      const otherUser = await User.create({
        email: 'other@beige.app',
        firstName: 'Other',
        lastName: 'User',
        password: 'password123'
      });

      const otherUserBooking = await Booking.create({
        ...testUtils.createTestBooking(),
        userId: otherUser._id,
        status: 'confirmed'
      });

      // testUser should not be able to cancel otherUser's booking
      const response = await request(app)
        .patch(`/api/v1/bookings/${otherUserBooking._id}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cancellationReason: 'Unauthorized attempt' })
        .expect(403);

      expect(response.body.message).toContain('not authorized');

      // Verify booking was not cancelled
      const unchangedBooking = await Booking.findById(otherUserBooking._id);
      expect(unchangedBooking.status).toBe('confirmed');
    });
  });

  describe('JWT Token Validation and Refresh', () => {
    test('should handle expired JWT tokens gracefully', async () => {
      // Create an expired token (mock implementation)
      const expiredToken = 'expired.jwt.token';

      const response = await request(app)
        .get('/api/v1/bookings/user')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.message).toContain('token');
    });

    test('should validate JWT token format and signature', async () => {
      const invalidTokens = [
        'invalid_token_format',
        'Bearer',
        '',
        'bearer malformed.jwt.token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid_payload.signature'
      ];

      for (const invalidToken of invalidTokens) {
        const response = await request(app)
          .get('/api/v1/bookings/user')
          .set('Authorization', `Bearer ${invalidToken}`);

        expect(response.status).toBe(401);
      }
    });

    test('should handle user not found for valid JWT token', async () => {
      // Create token for user that will be deleted
      const tempUser = await User.create({
        email: 'temp@beige.app',
        firstName: 'Temp',
        lastName: 'User',
        password: 'tempPassword123'
      });

      const tempToken = tempUser.generateAuthToken();

      // Delete the user
      await User.findByIdAndDelete(tempUser._id);

      const response = await request(app)
        .get('/api/v1/bookings/user')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(401);

      expect(response.body.message).toContain('User not found');
    });
  });

  describe('Payment Intent with Authentication', () => {
    test('should create payment intent with authenticated user context', async () => {
      const bookingData = {
        guestName: testUser.firstName + ' ' + testUser.lastName,
        guestEmail: testUser.email,
        guestPhone: '+1234567890',
        serviceType: 'videography',
        contentType: ['video'],
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endDateTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
        durationHours: 1,
        location: 'Test Location',
        budget: 300,
        totalAmount: 300
      };

      // Mock Stripe service
      const stripeService = require('../../src/services/stripe.service');
      const mockPaymentIntent = {
        id: 'pi_test_authenticated',
        client_secret: 'pi_test_authenticated_secret',
        amount: 30000,
        currency: 'usd'
      };

      jest.spyOn(stripeService, 'createPaymentIntent').mockResolvedValue(mockPaymentIntent);

      const response = await request(app)
        .post('/api/v1/stripe/create-payment-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(200);

      expect(response.body.clientSecret).toBe(mockPaymentIntent.client_secret);
      expect(response.body).toHaveProperty('bookingId');

      // Verify booking was created with user context
      const booking = await Booking.findById(response.body.bookingId);
      expect(booking.userId.toString()).toBe(testUser._id.toString());
    });

    test('should handle payment intent creation without explicit userId in request body', async () => {
      const bookingData = {
        guestName: testUser.firstName + ' ' + testUser.lastName,
        guestEmail: testUser.email,
        guestPhone: '+1234567890',
        serviceType: 'photography',
        contentType: ['photo'],
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endDateTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
        durationHours: 1,
        location: 'Test Location',
        budget: 250,
        totalAmount: 250
        // Note: No explicit userId in request body
      };

      const stripeService = require('../../src/services/stripe.service');
      const mockPaymentIntent = {
        id: 'pi_test_no_explicit_user',
        client_secret: 'pi_test_no_explicit_user_secret',
        amount: 25000,
        currency: 'usd'
      };

      jest.spyOn(stripeService, 'createPaymentIntent').mockResolvedValue(mockPaymentIntent);

      const response = await request(app)
        .post('/api/v1/stripe/create-payment-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(200);

      // Should extract userId from JWT token automatically
      const booking = await Booking.findById(response.body.bookingId);
      expect(booking.userId.toString()).toBe(testUser._id.toString());
    });
  });
});