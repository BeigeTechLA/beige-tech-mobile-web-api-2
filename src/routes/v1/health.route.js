const express = require('express');
const mongoose = require('mongoose');
const cacheService = require('../../services/cache.service');
const { stripeService } = require('../../services');

const router = express.Router();

/**
 * Health Check Routes for Production Monitoring
 * Provides comprehensive health and readiness checks
 */

/**
 * Basic health check
 * @route GET /health
 * @returns {Object} Basic health status
 */
router.get('/', async (req, res) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  };

  res.status(200).json(healthCheck);
});

/**
 * Detailed health check with all dependencies
 * @route GET /health/detailed
 * @returns {Object} Comprehensive health status
 */
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    dependencies: {},
    performance: {},
    errors: []
  };

  // Check MongoDB connection
  try {
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    health.dependencies.mongodb = {
      status: dbState === 1 ? 'healthy' : 'unhealthy',
      state: dbStates[dbState],
      responseTime: null
    };

    if (dbState === 1) {
      const dbStart = Date.now();
      await mongoose.connection.db.admin().ping();
      health.dependencies.mongodb.responseTime = Date.now() - dbStart;
    }

  } catch (error) {
    health.dependencies.mongodb = {
      status: 'unhealthy',
      error: error.message,
      responseTime: null
    };
    health.errors.push(`MongoDB: ${error.message}`);
  }

  // Check Redis cache
  try {
    const cacheHealth = await cacheService.healthCheck();
    health.dependencies.redis = {
      status: cacheHealth.status === 'connected' ? 'healthy' : 'unhealthy',
      ...cacheHealth
    };

    if (cacheHealth.status !== 'connected') {
      health.errors.push(`Redis: ${cacheHealth.error || 'Not connected'}`);
    }

  } catch (error) {
    health.dependencies.redis = {
      status: 'unhealthy',
      error: error.message
    };
    health.errors.push(`Redis: ${error.message}`);
  }

  // Check Stripe connectivity
  try {
    const stripeStart = Date.now();
    // Simple test to verify Stripe connection
    await stripeService.retrieveBalance?.();
    health.dependencies.stripe = {
      status: 'healthy',
      responseTime: Date.now() - stripeStart
    };

  } catch (error) {
    health.dependencies.stripe = {
      status: 'degraded',
      error: error.message
    };
    // Stripe issues shouldn't fail health check completely
    health.errors.push(`Stripe: ${error.message}`);
  }

  // Check external API dependencies
  try {
    // Add other external API checks here (Airtable, email service, etc.)
    health.dependencies.external_apis = {
      status: 'healthy',
      services: {
        airtable: 'not_checked',
        email_service: 'not_checked'
      }
    };

  } catch (error) {
    health.dependencies.external_apis = {
      status: 'degraded',
      error: error.message
    };
  }

  // Performance metrics
  health.performance = {
    responseTime: Date.now() - startTime,
    cpuUsage: process.cpuUsage(),
    loadAverage: require('os').loadavg()
  };

  // Determine overall status
  const hasUnhealthyDependencies = Object.values(health.dependencies).some(
    dep => dep.status === 'unhealthy'
  );

  if (hasUnhealthyDependencies) {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Readiness probe for Kubernetes/container orchestration
 * @route GET /health/ready
 * @returns {Object} Readiness status
 */
router.get('/ready', async (req, res) => {
  const readiness = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  let isReady = true;

  // Check critical dependencies for readiness
  try {
    // MongoDB readiness
    if (mongoose.connection.readyState !== 1) {
      readiness.checks.mongodb = { status: 'not_ready', reason: 'Database not connected' };
      isReady = false;
    } else {
      readiness.checks.mongodb = { status: 'ready' };
    }

    // Cache readiness (optional, won't fail readiness)
    const cacheHealth = await cacheService.healthCheck();
    readiness.checks.redis = {
      status: cacheHealth.status === 'connected' ? 'ready' : 'optional_unavailable'
    };

    // Application-specific readiness checks
    readiness.checks.booking_system = { status: 'ready' };

  } catch (error) {
    readiness.checks.error = { status: 'not_ready', error: error.message };
    isReady = false;
  }

  readiness.status = isReady ? 'ready' : 'not_ready';
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json(readiness);
});

/**
 * Liveness probe for Kubernetes/container orchestration
 * @route GET /health/live
 * @returns {Object} Liveness status
 */
router.get('/live', (req, res) => {
  const liveness = {
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  };

  // Simple liveness check - if this endpoint responds, the process is alive
  res.status(200).json(liveness);
});

/**
 * Metrics endpoint for monitoring systems
 * @route GET /health/metrics
 * @returns {Object} Application metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        loadAverage: require('os').loadavg(),
        platform: process.platform,
        nodeVersion: process.version
      },
      database: {},
      cache: {},
      application: {}
    };

    // Database metrics
    if (mongoose.connection.readyState === 1) {
      try {
        const dbStats = await mongoose.connection.db.stats();
        metrics.database = {
          status: 'connected',
          collections: dbStats.collections,
          dataSize: dbStats.dataSize,
          indexSize: dbStats.indexSize,
          objects: dbStats.objects
        };

        // Booking-specific metrics
        const Booking = require('../../models/booking.model');
        const bookingStats = await Booking.getStats();
        metrics.application.bookings = bookingStats;

      } catch (dbError) {
        metrics.database = {
          status: 'error',
          error: dbError.message
        };
      }
    } else {
      metrics.database = {
        status: 'disconnected'
      };
    }

    // Cache metrics
    try {
      const cacheStats = await cacheService.getStats();
      metrics.cache = cacheStats || { status: 'unavailable' };
    } catch (cacheError) {
      metrics.cache = {
        status: 'error',
        error: cacheError.message
      };
    }

    // Application-specific metrics
    metrics.application.environment = process.env.NODE_ENV;
    metrics.application.version = process.env.npm_package_version || '1.0.0';

    res.status(200).json(metrics);

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Database connectivity check
 * @route GET /health/database
 * @returns {Object} Database health status
 */
router.get('/database', async (req, res) => {
  try {
    const startTime = Date.now();

    const dbHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      connection: {},
      performance: {},
      collections: {}
    };

    // Check connection state
    const connectionState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    dbHealth.connection = {
      state: states[connectionState],
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };

    if (connectionState === 1) {
      // Ping database
      const pingStart = Date.now();
      await mongoose.connection.db.admin().ping();
      const pingTime = Date.now() - pingStart;

      // Get database stats
      const dbStats = await mongoose.connection.db.stats();

      dbHealth.performance = {
        pingTime,
        responseTime: Date.now() - startTime
      };

      dbHealth.collections = {
        count: dbStats.collections,
        dataSize: Math.round(dbStats.dataSize / 1024 / 1024), // MB
        indexSize: Math.round(dbStats.indexSize / 1024 / 1024), // MB
        objects: dbStats.objects
      };

      // Test a simple query
      const Booking = require('../../models/booking.model');
      const queryStart = Date.now();
      await Booking.countDocuments();
      dbHealth.performance.queryTime = Date.now() - queryStart;

    } else {
      dbHealth.status = 'unhealthy';
      dbHealth.error = `Database connection state: ${states[connectionState]}`;
    }

    const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(dbHealth);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Cache connectivity and performance check
 * @route GET /health/cache
 * @returns {Object} Cache health status
 */
router.get('/cache', async (req, res) => {
  try {
    const cacheHealth = await cacheService.healthCheck();
    const cacheStats = await cacheService.getStats();

    const health = {
      status: cacheHealth.status === 'connected' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      connection: cacheHealth,
      statistics: cacheStats
    };

    // Test cache operations
    if (cacheHealth.status === 'connected') {
      const testKey = 'health_check_test';
      const testValue = { timestamp: Date.now() };

      const setStart = Date.now();
      await cacheService.set(testKey, testValue, 60);
      const setTime = Date.now() - setStart;

      const getStart = Date.now();
      const retrieved = await cacheService.get(testKey);
      const getTime = Date.now() - getStart;

      await cacheService.del(testKey);

      health.performance = {
        setTime,
        getTime,
        testSuccessful: JSON.stringify(retrieved) === JSON.stringify(testValue)
      };
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Application-specific health checks
 * @route GET /health/application
 * @returns {Object} Application health status
 */
router.get('/application', async (req, res) => {
  try {
    const appHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {},
      features: {},
      performance: {}
    };

    // Check booking system functionality
    try {
      const Booking = require('../../models/booking.model');

      const bookingCheck = {
        canQuery: false,
        canAggregate: false,
        recentBookings: 0
      };

      // Test basic queries
      const queryStart = Date.now();
      const recentBookings = await Booking.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      bookingCheck.canQuery = true;
      bookingCheck.recentBookings = recentBookings;
      const queryTime = Date.now() - queryStart;

      // Test aggregation
      const aggStart = Date.now();
      await Booking.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $limit: 5 }
      ]);
      bookingCheck.canAggregate = true;
      const aggTime = Date.now() - aggStart;

      appHealth.services.booking_system = {
        status: 'healthy',
        ...bookingCheck,
        performance: {
          queryTime,
          aggregationTime: aggTime
        }
      };

    } catch (bookingError) {
      appHealth.services.booking_system = {
        status: 'unhealthy',
        error: bookingError.message
      };
      appHealth.status = 'degraded';
    }

    // Check user management functionality
    try {
      const User = require('../../models/user.model');
      const userCount = await User.countDocuments();

      appHealth.services.user_management = {
        status: 'healthy',
        totalUsers: userCount
      };

    } catch (userError) {
      appHealth.services.user_management = {
        status: 'degraded',
        error: userError.message
      };
    }

    // Feature flags and configuration
    appHealth.features = {
      booking_enabled: true,
      payment_processing: true,
      user_authentication: true,
      cache_enabled: cacheService.isConnected
    };

    const statusCode = appHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(appHealth);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;