const logger = require('../config/logger');
const monitoringService = require('./monitoring.service');

/**
 * Production Alert and Notification Service
 * Handles critical system alerts and notifications
 */
class AlertService {
  constructor() {
    this.alertThresholds = {
      errorRate: {
        warning: 0.05, // 5% error rate
        critical: 0.1   // 10% error rate
      },
      responseTime: {
        warning: 2000,  // 2 seconds
        critical: 5000  // 5 seconds
      },
      booking: {
        failureRate: 0.1, // 10% booking failure rate
        maxProcessingTime: 30000 // 30 seconds
      },
      payment: {
        failureRate: 0.05, // 5% payment failure rate
        maxProcessingTime: 15000 // 15 seconds
      },
      health: {
        checkFailures: 3, // 3 consecutive health check failures
        responseTime: 10000 // 10 seconds for health checks
      }
    };

    this.alertHistory = new Map();
    this.metrics = {
      errors: [],
      responseTime: [],
      bookings: { successes: 0, failures: 0 },
      payments: { successes: 0, failures: 0 },
      healthChecks: { successes: 0, failures: 0, consecutive_failures: 0 }
    };
  }

  /**
   * Track an error and check if alert thresholds are breached
   */
  trackError(error, context = {}) {
    const timestamp = Date.now();

    this.metrics.errors.push({
      timestamp,
      error: error.message,
      context,
      severity: this.getSeverity(error, context)
    });

    // Keep only last hour of errors
    this.metrics.errors = this.metrics.errors.filter(
      e => timestamp - e.timestamp < 3600000 // 1 hour
    );

    // Check error rate thresholds
    this.checkErrorRateAlerts();

    // Check for critical errors that need immediate alerts
    if (this.isCriticalError(error, context)) {
      this.sendImmediateAlert('critical_error', {
        error: error.message,
        context,
        timestamp: new Date(timestamp).toISOString()
      });
    }
  }

  /**
   * Track response time and check performance alerts
   */
  trackResponseTime(duration, endpoint) {
    const timestamp = Date.now();

    this.metrics.responseTime.push({
      timestamp,
      duration,
      endpoint
    });

    // Keep only last hour of response times
    this.metrics.responseTime = this.metrics.responseTime.filter(
      rt => timestamp - rt.timestamp < 3600000
    );

    // Check response time alerts
    if (duration > this.alertThresholds.responseTime.critical) {
      this.sendAlert('critical_performance', {
        endpoint,
        responseTime: duration,
        threshold: this.alertThresholds.responseTime.critical
      });
    } else if (duration > this.alertThresholds.responseTime.warning) {
      this.sendAlert('warning_performance', {
        endpoint,
        responseTime: duration,
        threshold: this.alertThresholds.responseTime.warning
      });
    }
  }

  /**
   * Track booking events and check for booking-related alerts
   */
  trackBookingEvent(event, data) {
    if (event === 'booking_success') {
      this.metrics.bookings.successes++;
    } else if (event === 'booking_failure') {
      this.metrics.bookings.failures++;

      // Check booking failure rate
      const totalBookings = this.metrics.bookings.successes + this.metrics.bookings.failures;
      const failureRate = this.metrics.bookings.failures / totalBookings;

      if (totalBookings >= 10 && failureRate > this.alertThresholds.booking.failureRate) {
        this.sendAlert('high_booking_failure_rate', {
          failureRate: (failureRate * 100).toFixed(2) + '%',
          failures: this.metrics.bookings.failures,
          successes: this.metrics.bookings.successes,
          threshold: (this.alertThresholds.booking.failureRate * 100).toFixed(2) + '%'
        });
      }
    }
  }

  /**
   * Track payment events and check for payment-related alerts
   */
  trackPaymentEvent(event, data) {
    if (event === 'payment_success') {
      this.metrics.payments.successes++;
    } else if (event === 'payment_failure') {
      this.metrics.payments.failures++;

      // Check payment failure rate
      const totalPayments = this.metrics.payments.successes + this.metrics.payments.failures;
      const failureRate = this.metrics.payments.failures / totalPayments;

      if (totalPayments >= 5 && failureRate > this.alertThresholds.payment.failureRate) {
        this.sendAlert('high_payment_failure_rate', {
          failureRate: (failureRate * 100).toFixed(2) + '%',
          failures: this.metrics.payments.failures,
          successes: this.metrics.payments.successes,
          threshold: (this.alertThresholds.payment.failureRate * 100).toFixed(2) + '%'
        });
      }
    }
  }

  /**
   * Track health check results
   */
  trackHealthCheck(success, responseTime, checks = {}) {
    if (success) {
      this.metrics.healthChecks.successes++;
      this.metrics.healthChecks.consecutive_failures = 0;
    } else {
      this.metrics.healthChecks.failures++;
      this.metrics.healthChecks.consecutive_failures++;

      // Alert on consecutive health check failures
      if (this.metrics.healthChecks.consecutive_failures >= this.alertThresholds.health.checkFailures) {
        this.sendAlert('health_check_failure', {
          consecutiveFailures: this.metrics.healthChecks.consecutive_failures,
          failedChecks: Object.keys(checks).filter(key => checks[key].status !== 'healthy'),
          threshold: this.alertThresholds.health.checkFailures
        });
      }
    }

    // Alert on slow health checks
    if (responseTime > this.alertThresholds.health.responseTime) {
      this.sendAlert('slow_health_check', {
        responseTime,
        threshold: this.alertThresholds.health.responseTime
      });
    }
  }

  /**
   * Check error rate and send alerts if thresholds are breached
   */
  checkErrorRateAlerts() {
    const now = Date.now();
    const recentErrors = this.metrics.errors.filter(
      e => now - e.timestamp < 300000 // Last 5 minutes
    );

    if (recentErrors.length === 0) return;

    // Calculate error rate (errors per minute)
    const errorRate = recentErrors.length / 5; // per minute

    if (errorRate > this.alertThresholds.errorRate.critical) {
      this.sendAlert('critical_error_rate', {
        errorRate: errorRate.toFixed(2) + ' errors/min',
        recentErrors: recentErrors.length,
        threshold: this.alertThresholds.errorRate.critical + ' errors/min'
      });
    } else if (errorRate > this.alertThresholds.errorRate.warning) {
      this.sendAlert('warning_error_rate', {
        errorRate: errorRate.toFixed(2) + ' errors/min',
        recentErrors: recentErrors.length,
        threshold: this.alertThresholds.errorRate.warning + ' errors/min'
      });
    }
  }

  /**
   * Determine if an error is critical and needs immediate attention
   */
  isCriticalError(error, context) {
    const criticalPatterns = [
      /database.*connection/i,
      /stripe.*webhook.*failed/i,
      /payment.*processing.*failed/i,
      /redis.*connection/i,
      /mongodb.*connection/i,
      /out of memory/i,
      /timeout/i
    ];

    const criticalContexts = [
      'stripe_webhook_processing',
      'payment_processing',
      'database_operation',
      'cache_operation'
    ];

    return criticalPatterns.some(pattern => pattern.test(error.message)) ||
           criticalContexts.includes(context.context);
  }

  /**
   * Get error severity level
   */
  getSeverity(error, context) {
    if (this.isCriticalError(error, context)) {
      return 'critical';
    }

    if (error.statusCode >= 500) {
      return 'high';
    }

    if (error.statusCode >= 400) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Send alert with rate limiting
   */
  sendAlert(alertType, data, severity = 'warning') {
    const alertKey = `${alertType}_${JSON.stringify(data)}`;
    const now = Date.now();

    // Rate limiting: don't send the same alert more than once per 15 minutes
    if (this.alertHistory.has(alertKey)) {
      const lastSent = this.alertHistory.get(alertKey);
      if (now - lastSent < 900000) { // 15 minutes
        return;
      }
    }

    this.alertHistory.set(alertKey, now);

    // Clean up old alert history
    for (const [key, timestamp] of this.alertHistory.entries()) {
      if (now - timestamp > 3600000) { // 1 hour
        this.alertHistory.delete(key);
      }
    }

    const alert = {
      type: alertType,
      severity,
      timestamp: new Date().toISOString(),
      data,
      environment: process.env.NODE_ENV || 'development'
    };

    // Log alert
    logger.warn(`🚨 ALERT [${severity.toUpperCase()}]: ${alertType}`, alert);

    // Send to monitoring service (Sentry)
    monitoringService.trackEvent(`alert.${alertType}`, alert, severity);

    // In production, you would integrate with:
    // - Slack/Discord webhooks
    // - PagerDuty
    // - Email notifications
    // - SMS alerts (Twilio)

    this.sendNotification(alert);
  }

  /**
   * Send immediate alert for critical issues
   */
  sendImmediateAlert(alertType, data) {
    this.sendAlert(alertType, data, 'critical');
  }

  /**
   * Send notification to configured channels
   */
  sendNotification(alert) {
    // Example webhook implementation (you would configure actual endpoints)
    if (process.env.SLACK_WEBHOOK_URL && alert.severity === 'critical') {
      this.sendSlackAlert(alert);
    }

    if (process.env.DISCORD_WEBHOOK_URL) {
      this.sendDiscordAlert(alert);
    }

    // Email alerts for critical issues
    if (process.env.ALERT_EMAIL && alert.severity === 'critical') {
      this.sendEmailAlert(alert);
    }
  }

  /**
   * Send Slack alert (example implementation)
   */
  async sendSlackAlert(alert) {
    try {
      const axios = require('axios');

      const color = {
        critical: 'danger',
        warning: 'warning',
        info: 'good'
      }[alert.severity] || 'warning';

      const payload = {
        username: 'Beige Monitoring',
        icon_emoji: '🚨',
        attachments: [{
          color,
          title: `🚨 ${alert.type.replace(/_/g, ' ').toUpperCase()}`,
          text: JSON.stringify(alert.data, null, 2),
          timestamp: Math.floor(Date.now() / 1000),
          fields: [
            {
              title: 'Environment',
              value: alert.environment,
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true
            }
          ]
        }]
      };

      await axios.post(process.env.SLACK_WEBHOOK_URL, payload);
      logger.info('Slack alert sent successfully');
    } catch (error) {
      logger.error('Failed to send Slack alert', error);
    }
  }

  /**
   * Send Discord alert (example implementation)
   */
  async sendDiscordAlert(alert) {
    try {
      const axios = require('axios');

      const color = {
        critical: 15158332, // Red
        warning: 16776960,  // Yellow
        info: 3066993       // Green
      }[alert.severity] || 16776960;

      const payload = {
        embeds: [{
          title: `🚨 ${alert.type.replace(/_/g, ' ').toUpperCase()}`,
          description: `\`\`\`json\n${JSON.stringify(alert.data, null, 2)}\n\`\`\``,
          color,
          timestamp: alert.timestamp,
          fields: [
            {
              name: 'Environment',
              value: alert.environment,
              inline: true
            },
            {
              name: 'Severity',
              value: alert.severity.toUpperCase(),
              inline: true
            }
          ]
        }]
      };

      await axios.post(process.env.DISCORD_WEBHOOK_URL, payload);
      logger.info('Discord alert sent successfully');
    } catch (error) {
      logger.error('Failed to send Discord alert', error);
    }
  }

  /**
   * Send email alert (example implementation)
   */
  async sendEmailAlert(alert) {
    try {
      // This would integrate with your email service (SendGrid, SES, etc.)
      logger.info('Email alert would be sent here', alert);
    } catch (error) {
      logger.error('Failed to send email alert', error);
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary() {
    const now = Date.now();
    const recentErrors = this.metrics.errors.filter(e => now - e.timestamp < 3600000);
    const recentResponseTimes = this.metrics.responseTime.filter(rt => now - rt.timestamp < 3600000);

    return {
      errors: {
        total: recentErrors.length,
        bySeverity: {
          critical: recentErrors.filter(e => e.severity === 'critical').length,
          high: recentErrors.filter(e => e.severity === 'high').length,
          medium: recentErrors.filter(e => e.severity === 'medium').length,
          low: recentErrors.filter(e => e.severity === 'low').length
        }
      },
      performance: {
        averageResponseTime: recentResponseTimes.length > 0
          ? Math.round(recentResponseTimes.reduce((sum, rt) => sum + rt.duration, 0) / recentResponseTimes.length)
          : 0,
        slowRequests: recentResponseTimes.filter(rt => rt.duration > this.alertThresholds.responseTime.warning).length
      },
      bookings: {
        ...this.metrics.bookings,
        failureRate: this.metrics.bookings.failures / (this.metrics.bookings.successes + this.metrics.bookings.failures) || 0
      },
      payments: {
        ...this.metrics.payments,
        failureRate: this.metrics.payments.failures / (this.metrics.payments.successes + this.metrics.payments.failures) || 0
      },
      healthChecks: this.metrics.healthChecks
    };
  }

  /**
   * Reset metrics (useful for testing or scheduled resets)
   */
  resetMetrics() {
    this.metrics = {
      errors: [],
      responseTime: [],
      bookings: { successes: 0, failures: 0 },
      payments: { successes: 0, failures: 0 },
      healthChecks: { successes: 0, failures: 0, consecutive_failures: 0 }
    };

    logger.info('Alert service metrics reset');
  }
}

// Create singleton instance
const alertService = new AlertService();

module.exports = alertService;