const express = require('express');
const auth = require('../../middlewares/auth');
const alertService = require('../../services/alert.service');
const monitoringService = require('../../services/monitoring.service');

const router = express.Router();

/**
 * Monitoring and Alert API Routes
 * Provides access to system monitoring data and alert metrics
 */

/**
 * Get alert metrics summary
 * @route GET /monitoring/alerts
 * @access Private (Admin only)
 */
router.get('/alerts', auth('admin'), async (req, res) => {
  try {
    const metrics = alertService.getMetricsSummary();

    res.status(200).json({
      success: true,
      data: {
        metrics,
        timestamp: new Date().toISOString(),
        alertThresholds: {
          errorRate: alertService.alertThresholds.errorRate,
          responseTime: alertService.alertThresholds.responseTime,
          booking: alertService.alertThresholds.booking,
          payment: alertService.alertThresholds.payment,
          health: alertService.alertThresholds.health
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving alert metrics',
      error: error.message
    });
  }
});

/**
 * Reset alert metrics
 * @route POST /monitoring/alerts/reset
 * @access Private (Admin only)
 */
router.post('/alerts/reset', auth('admin'), async (req, res) => {
  try {
    alertService.resetMetrics();

    res.status(200).json({
      success: true,
      message: 'Alert metrics reset successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error resetting alert metrics',
      error: error.message
    });
  }
});

/**
 * Test alert system
 * @route POST /monitoring/alerts/test
 * @access Private (Admin only)
 */
router.post('/alerts/test', auth('admin'), async (req, res) => {
  try {
    const { alertType = 'test_alert', severity = 'warning' } = req.body;

    alertService.sendAlert(alertType, {
      message: 'This is a test alert triggered manually',
      triggeredBy: req.user.email,
      timestamp: new Date().toISOString()
    }, severity);

    res.status(200).json({
      success: true,
      message: `Test alert sent successfully (${alertType} - ${severity})`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error sending test alert',
      error: error.message
    });
  }
});

/**
 * Get monitoring service health
 * @route GET /monitoring/status
 * @access Private (Admin only)
 */
router.get('/status', auth('admin'), async (req, res) => {
  try {
    const monitoringHealth = await monitoringService.healthCheck();

    res.status(200).json({
      success: true,
      data: {
        monitoring: monitoringHealth,
        alerts: {
          status: 'healthy',
          metricsAvailable: true
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving monitoring status',
      error: error.message
    });
  }
});

/**
 * Force flush monitoring data
 * @route POST /monitoring/flush
 * @access Private (Admin only)
 */
router.post('/flush', auth('admin'), async (req, res) => {
  try {
    const { timeout = 5000 } = req.body;
    const success = await monitoringService.flush(timeout);

    res.status(200).json({
      success,
      message: success ? 'Monitoring data flushed successfully' : 'Failed to flush monitoring data',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error flushing monitoring data',
      error: error.message
    });
  }
});

/**
 * Get real-time system metrics
 * @route GET /monitoring/metrics/realtime
 * @access Private (Admin only)
 */
router.get('/metrics/realtime', auth('admin'), async (req, res) => {
  try {
    const metrics = alertService.getMetricsSummary();
    const monitoringHealth = await monitoringService.healthCheck();

    // Add system metrics
    const systemMetrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid
    };

    res.status(200).json({
      success: true,
      data: {
        alerts: metrics,
        monitoring: monitoringHealth,
        system: systemMetrics,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving real-time metrics',
      error: error.message
    });
  }
});

/**
 * Export monitoring data
 * @route GET /monitoring/export
 * @access Private (Admin only)
 */
router.get('/export', auth('admin'), async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const metrics = alertService.getMetricsSummary();
    const monitoringHealth = await monitoringService.healthCheck();

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email,
      format,
      data: {
        alerts: metrics,
        monitoring: monitoringHealth,
        thresholds: alertService.alertThresholds
      }
    };

    if (format === 'csv') {
      // Convert to CSV format
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="monitoring-metrics.csv"');

      const csvData = [
        'Metric,Value,Timestamp',
        `Total Errors,${metrics.errors.total},${exportData.exportedAt}`,
        `Critical Errors,${metrics.errors.bySeverity.critical},${exportData.exportedAt}`,
        `Average Response Time,${metrics.performance.averageResponseTime}ms,${exportData.exportedAt}`,
        `Slow Requests,${metrics.performance.slowRequests},${exportData.exportedAt}`,
        `Booking Success Rate,${((1 - metrics.bookings.failureRate) * 100).toFixed(2)}%,${exportData.exportedAt}`,
        `Payment Success Rate,${((1 - metrics.payments.failureRate) * 100).toFixed(2)}%,${exportData.exportedAt}`,
        `Health Check Failures,${metrics.healthChecks.failures},${exportData.exportedAt}`
      ].join('\n');

      res.send(csvData);

    } else {
      // JSON export
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="monitoring-metrics.json"');

      res.json(exportData);
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error exporting monitoring data',
      error: error.message
    });
  }
});

module.exports = router;