const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * Production Error Monitoring and Performance Tracking Service
 * Integrates Sentry for comprehensive error tracking and performance monitoring
 */
class MonitoringService {
  constructor() {
    this.isInitialized = false;
    this.environment = config.env;
  }

  /**
   * Initialize Sentry monitoring
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    // Only initialize Sentry in production and staging environments
    if (!process.env.SENTRY_DSN || this.environment === 'test') {
      logger.info('Sentry monitoring disabled (no DSN provided or test environment)');
      return;
    }

    try {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: this.environment,
        integrations: [
          new Sentry.Integrations.Http({ tracing: true }),
          new Sentry.Integrations.Express({ app: require('../app') }),
          new Sentry.Integrations.Mongo(),
          new ProfilingIntegration(),
        ],

        // Performance Monitoring
        tracesSampleRate: this.environment === 'production' ? 0.1 : 1.0,
        profilesSampleRate: this.environment === 'production' ? 0.1 : 1.0,

        // Error Filtering
        beforeSend(event, hint) {
          // Filter out known non-critical errors
          const error = hint.originalException;

          if (error && error.message) {
            // Skip rate limiting errors
            if (error.message.includes('Too many requests')) {
              return null;
            }

            // Skip validation errors (these are user errors, not bugs)
            if (error.message.includes('ValidationError') ||
                error.message.includes('CastError')) {
              return null;
            }

            // Skip authentication errors for invalid tokens
            if (error.message.includes('JsonWebTokenError') ||
                error.message.includes('TokenExpiredError')) {
              return null;
            }
          }

          return event;
        },

        // Enhanced context
        initialScope: {
          tags: {
            component: 'beige-backend',
            version: process.env.npm_package_version || '1.0.0'
          }
        }
      });

      this.isInitialized = true;
      logger.info('Sentry monitoring initialized successfully', {
        environment: this.environment,
        dsn: process.env.SENTRY_DSN.substring(0, 50) + '...'
      });

    } catch (error) {
      logger.error('Failed to initialize Sentry monitoring', error);
    }
  }

  /**
   * Track custom business events
   */
  trackEvent(eventName, data = {}, level = 'info') {
    if (!this.isInitialized) return;

    Sentry.addBreadcrumb({
      message: eventName,
      level,
      data,
      timestamp: Date.now() / 1000
    });

    // For important business events, create actual Sentry events
    if (level === 'error' || level === 'warning') {
      Sentry.captureMessage(eventName, level);
    }
  }

  /**
   * Track booking-related events
   */
  trackBookingEvent(event, bookingData = {}) {
    const sanitizedData = {
      bookingId: bookingData.id,
      userId: bookingData.userId,
      amount: bookingData.amount,
      serviceType: bookingData.serviceType,
      status: bookingData.status,
      paymentMethod: bookingData.paymentMethod
    };

    this.trackEvent(`booking.${event}`, sanitizedData, 'info');

    // Track in alert service
    const alertService = require('./alert.service');
    if (event === 'created' || event === 'completed') {
      alertService.trackBookingEvent('booking_success', sanitizedData);
    } else if (event === 'failed' || event === 'cancelled') {
      alertService.trackBookingEvent('booking_failure', sanitizedData);
    }
  }

  /**
   * Track payment events
   */
  trackPaymentEvent(event, paymentData = {}) {
    const sanitizedData = {
      paymentIntentId: paymentData.paymentIntentId,
      amount: paymentData.amount,
      currency: paymentData.currency,
      status: paymentData.status,
      paymentMethod: paymentData.paymentMethod?.type
    };

    this.trackEvent(`payment.${event}`, sanitizedData, 'info');

    // Track in alert service
    const alertService = require('./alert.service');
    if (event === 'succeeded' || event === 'webhook_processed') {
      alertService.trackPaymentEvent('payment_success', sanitizedData);
    } else if (event === 'failed' || event === 'webhook_failed') {
      alertService.trackPaymentEvent('payment_failure', sanitizedData);
    }
  }

  /**
   * Track user authentication events
   */
  trackAuthEvent(event, userData = {}) {
    const sanitizedData = {
      userId: userData.id,
      email: userData.email ? userData.email.replace(/(.{2}).*(@.*)/, '$1***$2') : undefined,
      role: userData.role,
      loginMethod: userData.loginMethod
    };

    this.trackEvent(`auth.${event}`, sanitizedData, 'info');
  }

  /**
   * Track performance metrics
   */
  trackPerformance(operation, duration, metadata = {}) {
    if (!this.isInitialized) return;

    const transaction = Sentry.startTransaction({
      name: operation,
      op: 'custom'
    });

    transaction.setData('duration', duration);
    transaction.setData('metadata', metadata);
    transaction.finish();
  }

  /**
   * Set user context for error tracking
   */
  setUserContext(user) {
    if (!this.isInitialized) return;

    Sentry.setUser({
      id: user.id,
      email: user.email,
      role: user.role,
      segment: user.role === 'cp' ? 'content_provider' : 'customer'
    });
  }

  /**
   * Clear user context (on logout)
   */
  clearUserContext() {
    if (!this.isInitialized) return;
    Sentry.setUser(null);
  }

  /**
   * Capture error with enhanced context
   */
  captureError(error, context = {}) {
    if (!this.isInitialized) {
      logger.error('Monitoring error (Sentry not initialized)', error);
      return;
    }

    Sentry.withScope((scope) => {
      // Add custom context
      Object.keys(context).forEach(key => {
        scope.setContext(key, context[key]);
      });

      // Add request context if available
      if (context.req) {
        scope.setTag('url', context.req.url);
        scope.setTag('method', context.req.method);
        scope.setTag('userAgent', context.req.get('user-agent'));
        scope.setLevel('error');
      }

      Sentry.captureException(error);
    });

    // Track error in alert service
    const alertService = require('./alert.service');
    alertService.trackError(error, context);

    // Also log locally
    logger.error('Application error captured by monitoring', {
      error: error.message,
      stack: error.stack,
      context
    });
  }

  /**
   * Express middleware for request tracking
   */
  getRequestHandler() {
    if (!this.isInitialized) {
      return (req, res, next) => next();
    }
    return Sentry.Handlers.requestHandler();
  }

  /**
   * Express middleware for error tracking
   */
  getErrorHandler() {
    if (!this.isInitialized) {
      return (error, req, res, next) => next(error);
    }
    return Sentry.Handlers.errorHandler();
  }

  /**
   * Middleware for tracking trace context
   */
  getTracingHandler() {
    if (!this.isInitialized) {
      return (req, res, next) => next();
    }
    return Sentry.Handlers.tracingHandler();
  }

  /**
   * Check if monitoring is healthy
   */
  async healthCheck() {
    return {
      status: this.isInitialized ? 'healthy' : 'disabled',
      environment: this.environment,
      initialized: this.isInitialized,
      sentryDsn: process.env.SENTRY_DSN ? 'configured' : 'not_configured'
    };
  }

  /**
   * Flush all pending data to Sentry
   */
  async flush(timeout = 5000) {
    if (!this.isInitialized) return true;

    try {
      return await Sentry.flush(timeout);
    } catch (error) {
      logger.error('Failed to flush Sentry data', error);
      return false;
    }
  }

  /**
   * Close Sentry client
   */
  async close() {
    if (!this.isInitialized) return;

    try {
      await Sentry.close();
      this.isInitialized = false;
      logger.info('Sentry monitoring closed successfully');
    } catch (error) {
      logger.error('Failed to close Sentry monitoring', error);
    }
  }
}

// Create singleton instance
const monitoringService = new MonitoringService();

module.exports = monitoringService;