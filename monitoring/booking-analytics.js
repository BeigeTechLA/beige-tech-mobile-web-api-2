const { Booking, Order, User } = require('../src/models');
const logger = require('../src/config/logger');

/**
 * Business Analytics Service
 * Provides comprehensive booking and business metrics
 */
class BookingAnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cached result or execute function
   */
  async getCachedResult(key, fn, timeout = this.cacheTimeout) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < timeout) {
      return cached.data;
    }

    try {
      const result = await fn();
      this.cache.set(key, {
        data: result,
        timestamp: Date.now()
      });
      return result;
    } catch (error) {
      logger.error(`Analytics error for ${key}:`, error);
      // Return safe defaults for analytics
      return this.getSafeDefaults(key);
    }
  }

  /**
   * Get safe default values for analytics
   */
  getSafeDefaults(key) {
    const defaults = {
      totalBookings: 0,
      guestBookings: 0,
      authenticatedBookings: 0,
      completedOrders: 0,
      cancelledBookings: 0,
      conversionRate: 0,
      totalRevenue: 0,
      avgBookingValue: 0,
      trends: [],
      services: [],
      newUsers: 0,
      activeUsers: 0,
      repeatCustomers: 0,
      dateRange: { days: 30, endDate: new Date() },
      error: 'Analytics data temporarily unavailable'
    };

    if (key.includes('conversion')) {
      return {
        totalBookings: 0,
        guestBookings: 0,
        authenticatedBookings: 0,
        completedOrders: 0,
        cancelledBookings: 0,
        conversionRate: 0,
        dateRange: { days: 30, endDate: new Date() }
      };
    }

    if (key.includes('trends')) {
      return {
        trends: [],
        groupBy: 'day',
        dateRange: { days: 30, endDate: new Date() }
      };
    }

    return defaults;
  }

  /**
   * Get conversion funnel metrics
   */
  async getConversionFunnelMetrics(days = 30) {
    const cacheKey = `conversion_funnel_${days}`;

    return this.getCachedResult(cacheKey, async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      // Get bookings in date range
      const bookings = await Booking.find({
        createdAt: { $gte: startDate, $lte: endDate }
      });

      // Get orders (converted bookings) in date range - handle if Order model doesn't exist
      let orders = [];
      try {
        orders = await Order.find({
          createdAt: { $gte: startDate, $lte: endDate }
        });
      } catch (error) {
        logger.info('Order model not available, using booking status for completion tracking');
        orders = bookings.filter(b => b.status === 'completed' || b.status === 'confirmed');
      }

      // Calculate funnel metrics
      const totalBookings = bookings.length;
      const guestBookings = bookings.filter(b => !b.userId).length;
      const authenticatedBookings = bookings.filter(b => b.userId).length;
      const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'confirmed').length;
      const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;

      const conversionRate = totalBookings > 0 ? (completedOrders / totalBookings) * 100 : 0;

      return {
        totalBookings,
        guestBookings,
        authenticatedBookings,
        completedOrders,
        cancelledBookings,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        dateRange: { startDate, endDate, days }
      };
    });
  }

  /**
   * Get booking trends over time
   */
  async getBookingTrends(days = 30, groupBy = 'day') {
    const cacheKey = `booking_trends_${days}_${groupBy}`;

    return this.getCachedResult(cacheKey, async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      const pipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: this.getDateFormat(groupBy),
                date: '$createdAt'
              }
            },
            bookings: { $sum: 1 },
            totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
            avgAmount: { $avg: { $ifNull: ['$totalAmount', 0] } }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ];

      const trends = await Booking.aggregate(pipeline);

      return {
        trends: trends.map(t => ({
          date: t._id,
          bookings: t.bookings,
          totalAmount: t.totalAmount || 0,
          avgAmount: parseFloat((t.avgAmount || 0).toFixed(2))
        })),
        groupBy,
        dateRange: { startDate, endDate, days }
      };
    });
  }

  /**
   * Get service type analytics
   */
  async getServiceTypeAnalytics(days = 30) {
    const cacheKey = `service_analytics_${days}`;

    return this.getCachedResult(cacheKey, async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      const pipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$serviceType', 'Unknown'] },
            bookings: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
            avgBookingValue: { $avg: { $ifNull: ['$totalAmount', 0] } }
          }
        },
        {
          $sort: { bookings: -1 }
        }
      ];

      const serviceStats = await Booking.aggregate(pipeline);

      return {
        services: serviceStats.map(s => ({
          serviceType: s._id,
          bookings: s.bookings,
          totalRevenue: s.totalRevenue || 0,
          avgBookingValue: parseFloat((s.avgBookingValue || 0).toFixed(2))
        })),
        dateRange: { startDate, endDate, days }
      };
    });
  }

  /**
   * Get user behavior metrics
   */
  async getUserBehaviorMetrics(days = 30) {
    const cacheKey = `user_behavior_${days}`;

    return this.getCachedResult(cacheKey, async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      // Get user statistics
      const totalUsers = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });

      // Get active users (try lastActive field, fall back to recent booking activity)
      let activeUsers = 0;
      try {
        activeUsers = await User.countDocuments({
          lastActive: { $gte: startDate }
        });
      } catch (error) {
        // Fall back to users with recent bookings
        const usersWithRecentBookings = await Booking.distinct('userId', {
          createdAt: { $gte: startDate },
          userId: { $ne: null }
        });
        activeUsers = usersWithRecentBookings.length;
      }

      // Get repeat customers
      const repeatCustomers = await Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            userId: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$userId',
            bookingCount: { $sum: 1 }
          }
        },
        {
          $match: { bookingCount: { $gt: 1 } }
        }
      ]);

      return {
        newUsers: totalUsers,
        activeUsers,
        repeatCustomers: repeatCustomers.length,
        userRetentionRate: totalUsers > 0 ? parseFloat(((repeatCustomers.length / totalUsers) * 100).toFixed(2)) : 0,
        dateRange: { startDate, endDate, days }
      };
    });
  }

  /**
   * Get revenue analytics
   */
  async getRevenueAnalytics(days = 30) {
    const cacheKey = `revenue_analytics_${days}`;

    return this.getCachedResult(cacheKey, async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      const pipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
            avgBookingValue: { $avg: { $ifNull: ['$totalAmount', 0] } },
            totalBookings: { $sum: 1 },
            minBookingValue: { $min: { $ifNull: ['$totalAmount', 0] } },
            maxBookingValue: { $max: { $ifNull: ['$totalAmount', 0] } }
          }
        }
      ];

      const revenueStats = await Booking.aggregate(pipeline);
      const stats = revenueStats[0] || {
        totalRevenue: 0,
        avgBookingValue: 0,
        totalBookings: 0,
        minBookingValue: 0,
        maxBookingValue: 0
      };

      return {
        totalRevenue: stats.totalRevenue || 0,
        avgBookingValue: parseFloat((stats.avgBookingValue || 0).toFixed(2)),
        totalBookings: stats.totalBookings || 0,
        minBookingValue: stats.minBookingValue || 0,
        maxBookingValue: stats.maxBookingValue || 0,
        dateRange: { startDate, endDate, days }
      };
    });
  }

  /**
   * Get comprehensive dashboard analytics
   */
  async getDashboardAnalytics(days = 30) {
    const cacheKey = `dashboard_analytics_${days}`;

    return this.getCachedResult(cacheKey, async () => {
      const [conversion, trends, services, users, revenue] = await Promise.allSettled([
        this.getConversionFunnelMetrics(days),
        this.getBookingTrends(days, 'day'),
        this.getServiceTypeAnalytics(days),
        this.getUserBehaviorMetrics(days),
        this.getRevenueAnalytics(days)
      ]);

      // Extract values or use defaults
      const conversionData = conversion.status === 'fulfilled' ? conversion.value : this.getSafeDefaults('conversion');
      const trendsData = trends.status === 'fulfilled' ? trends.value : this.getSafeDefaults('trends');
      const servicesData = services.status === 'fulfilled' ? services.value : this.getSafeDefaults('services');
      const usersData = users.status === 'fulfilled' ? users.value : this.getSafeDefaults('users');
      const revenueData = revenue.status === 'fulfilled' ? revenue.value : this.getSafeDefaults('revenue');

      return {
        overview: {
          totalBookings: conversionData.totalBookings || 0,
          totalRevenue: revenueData.totalRevenue || 0,
          conversionRate: conversionData.conversionRate || 0,
          avgBookingValue: revenueData.avgBookingValue || 0
        },
        conversion: conversionData,
        trends: trendsData.trends || [],
        services: servicesData.services || [],
        users: usersData,
        revenue: revenueData,
        dateRange: { days, endDate: new Date() }
      };
    });
  }

  /**
   * Get real-time metrics
   */
  async getRealTimeMetrics() {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
      const lastHour = new Date(now.getTime() - (60 * 60 * 1000));

      const [bookingsLast24h, bookingsLastHour, activeUsers] = await Promise.allSettled([
        Booking.countDocuments({ createdAt: { $gte: last24h } }),
        Booking.countDocuments({ createdAt: { $gte: lastHour } }),
        User.countDocuments({ lastActive: { $gte: lastHour } }).catch(() => 0)
      ]);

      return {
        bookingsLast24h: bookingsLast24h.status === 'fulfilled' ? bookingsLast24h.value : 0,
        bookingsLastHour: bookingsLastHour.status === 'fulfilled' ? bookingsLastHour.value : 0,
        activeUsersLastHour: activeUsers.status === 'fulfilled' ? activeUsers.value : 0,
        timestamp: now.toISOString()
      };
    } catch (error) {
      logger.error('Error getting real-time metrics:', error);
      return {
        bookingsLast24h: 0,
        bookingsLastHour: 0,
        activeUsersLastHour: 0,
        timestamp: new Date().toISOString(),
        error: 'Real-time metrics unavailable'
      };
    }
  }

  /**
   * Clear analytics cache
   */
  async clearCache(pattern = null) {
    if (pattern) {
      let deletedCount = 0;
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          deletedCount++;
        }
      }
      return deletedCount;
    } else {
      const size = this.cache.size;
      this.cache.clear();
      return size;
    }
  }

  /**
   * Get date format for grouping
   */
  getDateFormat(groupBy) {
    switch (groupBy) {
      case 'hour':
        return '%Y-%m-%d %H:00:00';
      case 'day':
        return '%Y-%m-%d';
      case 'week':
        return '%Y-W%U';
      case 'month':
        return '%Y-%m';
      default:
        return '%Y-%m-%d';
    }
  }
}

// Create singleton instance
const bookingAnalyticsService = new BookingAnalyticsService();

module.exports = bookingAnalyticsService;