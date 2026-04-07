const request = require('supertest');
const app = require('../../src/app');
const Booking = require('../../src/models/booking.model');
const Order = require('../../src/models/order.model');
const { stripeService } = require('../../src/services');

describe('Webhook Processing Integration Tests', () => {
  const mockSignature = 'test_webhook_signature';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Stripe Webhook Events', () => {
    test('should process checkout.session.completed webhook', async () => {
      // Create a booking awaiting payment
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripeSessionId: 'cs_test_session_123',
        status: 'confirmed',
        paymentStatus: 'pending'
      });

      const webhookEvent = {
        id: 'evt_test_checkout_completed',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_session_123',
            payment_status: 'paid',
            payment_intent: 'pi_test_intent_123',
            amount_total: 15000,
            customer_details: {
              email: booking.guestEmail,
              name: booking.guestName
            },
            metadata: {
              bookingId: booking._id.toString()
            }
          }
        }
      };

      // Mock Stripe webhook verification
      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify booking was updated
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.status).toBe('paid');
      expect(updatedBooking.paymentStatus).toBe('paid');
      expect(updatedBooking.stripePaymentIntentId).toBe('pi_test_intent_123');
    });

    test('should process payment_intent.succeeded webhook', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripePaymentIntentId: 'pi_test_intent_456',
        status: 'confirmed',
        paymentStatus: 'processing'
      });

      const webhookEvent = {
        id: 'evt_test_payment_succeeded',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_intent_456',
            amount: 15000,
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              bookingId: booking._id.toString()
            }
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(response.body.received).toBe(true);

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('paid');
    });

    test('should process payment_intent.payment_failed webhook', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripePaymentIntentId: 'pi_test_failed_789',
        status: 'confirmed',
        paymentStatus: 'processing'
      });

      const webhookEvent = {
        id: 'evt_test_payment_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_failed_789',
            status: 'requires_payment_method',
            last_payment_error: {
              message: 'Your card was declined.'
            },
            metadata: {
              bookingId: booking._id.toString()
            }
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(response.body.received).toBe(true);

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('failed');
    });

    test('should handle charge.dispute.created webhook', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripePaymentIntentId: 'pi_test_disputed',
        status: 'paid',
        paymentStatus: 'paid'
      });

      const webhookEvent = {
        id: 'evt_test_dispute_created',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_test_dispute',
            payment_intent: 'pi_test_disputed',
            amount: 15000,
            reason: 'fraudulent',
            status: 'warning_needs_response'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify booking status reflects dispute
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('disputed');
    });
  });

  describe('Webhook Idempotency and Error Handling', () => {
    test('should handle duplicate webhook events gracefully', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripeSessionId: 'cs_test_duplicate_event',
        status: 'confirmed',
        paymentStatus: 'pending'
      });

      const webhookEvent = {
        id: 'evt_test_duplicate',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_duplicate_event',
            payment_status: 'paid',
            payment_intent: 'pi_test_duplicate'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      // First webhook delivery
      const firstResponse = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(firstResponse.body.received).toBe(true);

      const firstUpdate = await Booking.findById(booking._id);
      const firstUpdateTime = firstUpdate.updatedAt;

      // Wait a moment to ensure timestamp difference
      await testUtils.sleep(100);

      // Second webhook delivery (duplicate)
      const secondResponse = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(secondResponse.body.received).toBe(true);

      const secondUpdate = await Booking.findById(booking._id);

      // Should not update timestamp if already processed
      expect(secondUpdate.updatedAt.getTime()).toBe(firstUpdateTime.getTime());
      expect(secondUpdate.paymentStatus).toBe('paid');
    });

    test('should handle webhook for non-existent booking', async () => {
      const webhookEvent = {
        id: 'evt_test_not_found',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_nonexistent',
            payment_status: 'paid'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      // Should still return success to acknowledge webhook receipt
      expect(response.body.received).toBe(true);
      expect(response.body.warning).toContain('not found');
    });

    test('should handle invalid webhook signature', async () => {
      const webhookEvent = {
        id: 'evt_test_invalid_sig',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test' } }
      };

      // Mock Stripe to throw signature verification error
      jest.spyOn(stripeService, 'constructEvent').mockImplementation(() => {
        const error = new Error('Invalid signature');
        error.type = 'StripeSignatureVerificationError';
        throw error;
      });

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', 'invalid_signature')
        .expect(400);

      expect(response.body.error).toContain('Invalid signature');
    });

    test('should handle malformed webhook payload', async () => {
      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send('invalid json payload')
        .set('stripe-signature', mockSignature)
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body.error).toContain('Invalid JSON');
    });

    test('should handle unsupported webhook event types', async () => {
      const webhookEvent = {
        id: 'evt_test_unsupported',
        type: 'customer.created', // Unsupported event type
        data: {
          object: {
            id: 'cus_test_customer'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.message).toContain('ignored');
    });
  });

  describe('Automatic Order Conversion', () => {
    test('should automatically convert booking to order on payment completion', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripeSessionId: 'cs_test_auto_convert',
        status: 'confirmed',
        paymentStatus: 'pending',
        totalAmount: 150
      });

      const webhookEvent = {
        id: 'evt_test_auto_convert',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_auto_convert',
            payment_status: 'paid',
            amount_total: 15000
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(response.body.received).toBe(true);

      // Wait for async order conversion
      await testUtils.sleep(1000);

      // Verify booking was converted to order
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.status).toBe('converted');
      expect(updatedBooking.orderId).toBeTruthy();

      // Verify order was created
      const order = await Order.findById(updatedBooking.orderId);
      expect(order).toBeTruthy();
      expect(order.booking_ref.toString()).toBe(booking._id.toString());
      expect(order.total_amount).toBe(150);
    });

    test('should handle conversion failure gracefully', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripeSessionId: 'cs_test_conversion_fail',
        status: 'confirmed',
        paymentStatus: 'pending'
      });

      // Mock Order creation to fail
      jest.spyOn(Order, 'create').mockRejectedValue(new Error('Database error'));

      const webhookEvent = {
        id: 'evt_test_conversion_fail',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_conversion_fail',
            payment_status: 'paid'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(response.body.received).toBe(true);

      // Booking should be marked as paid but not converted
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking.paymentStatus).toBe('paid');
      expect(updatedBooking.status).toBe('paid'); // Not converted due to error
      expect(updatedBooking.orderId).toBeFalsy();
    });
  });

  describe('Retry Logic and Dead Letter Queue', () => {
    test('should handle webhook processing failures with retry', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripeSessionId: 'cs_test_retry',
        status: 'confirmed',
        paymentStatus: 'pending'
      });

      const webhookEvent = {
        id: 'evt_test_retry',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_retry',
            payment_status: 'paid'
          }
        }
      };

      // Mock database save to fail first time, succeed second time
      let callCount = 0;
      const originalSave = Booking.prototype.save;
      Booking.prototype.save = jest.fn().mockImplementation(function() {
        callCount++;
        if (callCount === 1) {
          throw new Error('Database temporarily unavailable');
        }
        return originalSave.call(this);
      });

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      // First attempt should fail
      const firstResponse = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(500);

      expect(firstResponse.body.error).toContain('temporarily unavailable');

      // Second attempt should succeed
      const secondResponse = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(secondResponse.body.received).toBe(true);

      // Restore original method
      Booking.prototype.save = originalSave;
    });

    test('should track failed webhook processing attempts', async () => {
      const webhookEvent = {
        id: 'evt_test_tracking',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_nonexistent_tracking',
            payment_status: 'paid'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      // This should log the failed attempt
      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.warning).toContain('not found');
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle concurrent webhook processing', async () => {
      // Create multiple bookings
      const bookings = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          Booking.create({
            ...testUtils.createTestBooking(),
            stripeSessionId: `cs_test_concurrent_${i}`,
            status: 'confirmed',
            paymentStatus: 'pending'
          })
        )
      );

      // Create concurrent webhook events
      const webhookPromises = bookings.map((booking, i) => {
        const webhookEvent = {
          id: `evt_test_concurrent_${i}`,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: `cs_test_concurrent_${i}`,
              payment_status: 'paid'
            }
          }
        };

        jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

        return request(app)
          .post('/api/v1/stripe/webhook')
          .send(JSON.stringify(webhookEvent))
          .set('stripe-signature', mockSignature);
      });

      const responses = await Promise.all(webhookPromises);

      // All webhooks should process successfully
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.received).toBe(true);
      });

      // Verify all bookings were updated
      const updatedBookings = await Booking.find({
        stripeSessionId: { $regex: /^cs_test_concurrent_/ }
      });

      expect(updatedBookings).toHaveLength(5);
      updatedBookings.forEach(booking => {
        expect(booking.paymentStatus).toBe('paid');
      });
    });

    test('should complete webhook processing within performance thresholds', async () => {
      const booking = await Booking.create({
        ...testUtils.createTestBooking(),
        stripeSessionId: 'cs_test_performance',
        status: 'confirmed',
        paymentStatus: 'pending'
      });

      const webhookEvent = {
        id: 'evt_test_performance',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_performance',
            payment_status: 'paid'
          }
        }
      };

      jest.spyOn(stripeService, 'constructEvent').mockReturnValue(webhookEvent);

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/v1/stripe/webhook')
        .send(JSON.stringify(webhookEvent))
        .set('stripe-signature', mockSignature)
        .expect(200);

      const processingTime = Date.now() - startTime;

      expect(response.body.received).toBe(true);
      expect(processingTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});