const express = require('express');
const auth = require('../../middlewares/auth');
const analyticsService = require('../../../monitoring/booking-analytics');

const router = express.Router();

/**
 * Analytics API Routes
 * Provides business metrics and insights for the booking system
 */

/**
 * Get conversion funnel metrics
 * @route GET /analytics/conversion
 * @access Private (Admin only)
 */
router.get('/conversion', auth('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateRange = parseInt(days);

    const metrics = await analyticsService.getConversionFunnelMetrics(dateRange);

    res.status(200).json({
      success: true,
      data: metrics
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving conversion metrics',
      error: error.message
    });
  }
});

/**
 * Get booking trends over time
 * @route GET /analytics/trends
 * @access Private (Admin only)
 */
router.get('/trends', auth('admin'), async (req, res) => {
  try {
    const { days = 30, groupBy = 'day' } = req.query;
    const dateRange = parseInt(days);

    if (!['hour', 'day', 'week', 'month'].includes(groupBy)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid groupBy parameter. Must be: hour, day, week, or month'
      });
    }

    const trends = await analyticsService.getBookingTrends(dateRange, groupBy);

    res.status(200).json({
      success: true,
      data: trends
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving booking trends',
      error: error.message
    });
  }
});

/**
 * Get service type performance analytics
 * @route GET /analytics/services
 * @access Private (Admin only)
 */
router.get('/services', auth('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateRange = parseInt(days);

    const serviceAnalytics = await analyticsService.getServiceTypeAnalytics(dateRange);

    res.status(200).json({
      success: true,
      data: serviceAnalytics
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving service analytics',
      error: error.message
    });
  }
});

/**
 * Get user behavior and cohort metrics
 * @route GET /analytics/users
 * @access Private (Admin only)
 */
router.get('/users', auth('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateRange = parseInt(days);

    const userMetrics = await analyticsService.getUserBehaviorMetrics(dateRange);

    res.status(200).json({
      success: true,
      data: userMetrics
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving user behavior metrics',
      error: error.message
    });
  }
});

/**
 * Get revenue and financial analytics
 * @route GET /analytics/revenue
 * @access Private (Admin only)
 */
router.get('/revenue', auth('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateRange = parseInt(days);

    const revenueAnalytics = await analyticsService.getRevenueAnalytics(dateRange);

    res.status(200).json({
      success: true,
      data: revenueAnalytics
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving revenue analytics',
      error: error.message
    });
  }
});

/**
 * Get comprehensive dashboard analytics
 * @route GET /analytics/dashboard
 * @access Private (Admin only)
 */
router.get('/dashboard', auth('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateRange = parseInt(days);

    const dashboardData = await analyticsService.getDashboardAnalytics(dateRange);

    res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving dashboard analytics',
      error: error.message
    });
  }
});

/**
 * Get real-time metrics
 * @route GET /analytics/realtime
 * @access Private (Admin only)
 */
router.get('/realtime', auth('admin'), async (req, res) => {
  try {
    const realTimeMetrics = await analyticsService.getRealTimeMetrics();

    res.status(200).json({
      success: true,
      data: realTimeMetrics
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
 * Clear analytics cache
 * @route DELETE /analytics/cache
 * @access Private (Admin only)
 */
router.delete('/cache', auth('admin'), async (req, res) => {
  try {
    const { pattern } = req.query;
    const deletedCount = await analyticsService.clearCache(pattern);

    res.status(200).json({
      success: true,
      message: `Cleared ${deletedCount} cache entries`,
      deletedCount
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error clearing analytics cache',
      error: error.message
    });
  }
});

/**
 * Export analytics data
 * @route GET /analytics/export
 * @access Private (Admin only)
 */
router.get('/export', auth('admin'), async (req, res) => {
  try {
    const { days = 30, format = 'json' } = req.query;
    const dateRange = parseInt(days);

    const dashboardData = await analyticsService.getDashboardAnalytics(dateRange);

    if (format === 'csv') {
      // Convert to CSV format
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${dateRange}days.csv"`);

      // Simple CSV export of key metrics
      const csvData = [
        'Metric,Value',
        `Total Bookings,${dashboardData.overview.totalBookings}`,
        `Total Revenue,${dashboardData.overview.totalRevenue}`,
        `Conversion Rate,${dashboardData.overview.conversionRate}%`,
        `Average Booking Value,${dashboardData.overview.avgBookingValue}`,
        `Guest Bookings,${dashboardData.conversion.guestBookings}`,
        `Authenticated Bookings,${dashboardData.conversion.authenticatedBookings}`,
        `Cancelled Bookings,${dashboardData.conversion.cancelledBookings}`
      ].join('\n');

      res.send(csvData);

    } else {
      // JSON export
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${dateRange}days.json"`);

      res.json({
        exportedAt: new Date().toISOString(),
        dateRange,
        data: dashboardData
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error exporting analytics data',
      error: error.message
    });
  }
});

module.exports = router;