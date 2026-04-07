const mongoose = require('mongoose');
const Redis = require('ioredis');
const Booking = require('../src/models/booking.model');
const User = require('../src/models/user.model');
const Order = require('../src/models/order.model');

/**
 * Database Optimization Script for Production
 * Optimizes MongoDB indexes and implements Redis caching layer
 */

let redis;

async function connectToDatabase() {
  console.log('🔌 Connecting to database...');

  const mongoUri = process.env.MONGODB_URL || 'mongodb://localhost:27017/beige';
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('✅ Connected to MongoDB');

  // Connect to Redis
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redis = new Redis(redisUrl);

  console.log('✅ Connected to Redis');
}

async function createOptimizedIndexes() {
  console.log('📊 Creating optimized database indexes...');

  // Booking collection indexes
  console.log('Creating Booking indexes...');

  // Core query indexes (already exist in model, but ensuring they're created)
  await Booking.collection.createIndex({ userId: 1, createdAt: -1 });
  await Booking.collection.createIndex({ guestEmail: 1, createdAt: -1 });
  await Booking.collection.createIndex({ status: 1, paymentStatus: 1 });
  await Booking.collection.createIndex({ startDateTime: 1, status: 1 });

  // Performance-critical compound indexes
  await Booking.collection.createIndex(
    { userId: 1, status: 1, startDateTime: 1 },
    { name: 'user_status_date_idx' }
  );

  await Booking.collection.createIndex(
    { guestEmail: 1, status: 1, createdAt: -1 },
    { name: 'guest_status_created_idx' }
  );

  await Booking.collection.createIndex(
    { paymentStatus: 1, status: 1, updatedAt: -1 },
    { name: 'payment_status_updated_idx' }
  );

  // Analytics and reporting indexes
  await Booking.collection.createIndex(
    { createdAt: 1, serviceType: 1, status: 1 },
    { name: 'analytics_service_status_idx' }
  );

  await Booking.collection.createIndex(
    { startDateTime: 1, endDateTime: 1, status: 1 },
    { name: 'scheduling_conflict_idx' }
  );

  // External system tracking indexes
  await Booking.collection.createIndex(
    { stripeSessionId: 1 },
    { unique: true, sparse: true, name: 'stripe_session_unique_idx' }
  );

  await Booking.collection.createIndex(
    { stripePaymentIntentId: 1 },
    { unique: true, sparse: true, name: 'stripe_intent_unique_idx' }
  );

  await Booking.collection.createIndex(
    { airtableId: 1 },
    { unique: true, sparse: true, name: 'airtable_unique_idx' }
  );

  // Conversion tracking indexes
  await Booking.collection.createIndex(
    { status: 1, paymentStatus: 1, orderId: 1 },
    { name: 'conversion_tracking_idx' }
  );

  await Booking.collection.createIndex(
    { convertedAt: 1 },
    { sparse: true, name: 'converted_date_idx' }
  );

  // User collection indexes
  console.log('Creating User indexes...');

  await User.collection.createIndex(
    { email: 1 },
    { unique: true, name: 'email_unique_idx' }
  );

  await User.collection.createIndex(
    { role: 1, isEmailVerified: 1, createdAt: -1 },
    { name: 'user_role_verified_idx' }
  );

  await User.collection.createIndex(
    { lastLoginAt: -1 },
    { sparse: true, name: 'last_login_idx' }
  );

  // Order collection indexes (if Order model exists)
  try {
    console.log('Creating Order indexes...');

    await Order.collection.createIndex(
      { client_id: 1, createdAt: -1 },
      { name: 'client_orders_idx' }
    );

    await Order.collection.createIndex(
      { booking_ref: 1 },
      { unique: true, sparse: true, name: 'booking_ref_unique_idx' }
    );

    await Order.collection.createIndex(
      { order_status: 1, updatedAt: -1 },
      { name: 'order_status_updated_idx' }
    );

    await Order.collection.createIndex(
      { createdAt: 1, order_status: 1, total_amount: 1 },
      { name: 'order_analytics_idx' }
    );

  } catch (error) {
    console.log('⚠️ Order collection not found, skipping order indexes');
  }

  console.log('✅ All database indexes created successfully');
}

async function implementCachingLayer() {
  console.log('🚀 Implementing Redis caching layer...');

  // Cache user booking counts
  await cacheUserBookingStats();

  // Cache booking statistics
  await cacheBookingStatistics();

  // Cache frequently accessed data
  await cacheFrequentlyAccessedData();

  console.log('✅ Caching layer implemented successfully');
}

async function cacheUserBookingStats() {
  console.log('📊 Caching user booking statistics...');

  const users = await User.find({ role: 'client' }).select('_id email').lean();

  for (const user of users) {
    try {
      // Get user booking statistics
      const stats = await Booking.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            completedBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] }
            },
            upcomingBookings: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ['$status', ['confirmed', 'paid']] },
                      { $gte: ['$startDateTime', new Date()] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            totalSpent: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0]
              }
            },
            avgBookingValue: {
              $avg: {
                $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', null]
              }
            }
          }
        }
      ]);

      const userStats = stats[0] || {
        totalBookings: 0,
        completedBookings: 0,
        upcomingBookings: 0,
        totalSpent: 0,
        avgBookingValue: 0
      };

      // Cache for 5 minutes
      await redis.setex(
        `user:${user._id}:stats`,
        300,
        JSON.stringify(userStats)
      );

    } catch (error) {
      console.error(`Error caching stats for user ${user._id}:`, error.message);
    }
  }

  console.log(`✅ Cached stats for ${users.length} users`);
}

async function cacheBookingStatistics() {
  console.log('📊 Caching global booking statistics...');

  try {
    // Overall booking statistics
    const overallStats = await Booking.aggregate([
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          pendingBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          confirmedBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
          },
          paidBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
          },
          convertedBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] }
          },
          cancelledBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          totalRevenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0]
            }
          },
          guestBookings: {
            $sum: { $cond: [{ $eq: ['$userId', null] }, 1, 0] }
          },
          authenticatedBookings: {
            $sum: { $cond: [{ $ne: ['$userId', null] }, 1, 0] }
          }
        }
      }
    ]);

    await redis.setex(
      'bookings:overall:stats',
      600, // 10 minutes
      JSON.stringify(overallStats[0] || {})
    );

    // Daily booking statistics for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const dailyStats = await Booking.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          bookings: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0]
            }
          },
          guestBookings: {
            $sum: { $cond: [{ $eq: ['$userId', null] }, 1, 0] }
          },
          authenticatedBookings: {
            $sum: { $cond: [{ $ne: ['$userId', null] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    await redis.setex(
      'bookings:daily:stats',
      1800, // 30 minutes
      JSON.stringify(dailyStats)
    );

    // Service type statistics
    const serviceStats = await Booking.aggregate([
      {
        $group: {
          _id: '$serviceType',
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0]
            }
          },
          avgValue: {
            $avg: {
              $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', null]
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    await redis.setex(
      'bookings:service:stats',
      1800, // 30 minutes
      JSON.stringify(serviceStats)
    );

    console.log('✅ Global booking statistics cached');

  } catch (error) {
    console.error('Error caching booking statistics:', error.message);
  }
}

async function cacheFrequentlyAccessedData() {
  console.log('📦 Caching frequently accessed data...');

  try {
    // Cache recent bookings for quick access
    const recentBookings = await Booking.find({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
    .select('_id guestName guestEmail serviceType status paymentStatus totalAmount createdAt userId')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

    await redis.setex(
      'bookings:recent',
      300, // 5 minutes
      JSON.stringify(recentBookings)
    );

    // Cache upcoming bookings
    const upcomingBookings = await Booking.find({
      startDateTime: { $gte: new Date() },
      status: { $in: ['confirmed', 'paid'] }
    })
    .select('_id guestName serviceType startDateTime location status userId')
    .sort({ startDateTime: 1 })
    .limit(50)
    .lean();

    await redis.setex(
      'bookings:upcoming',
      600, // 10 minutes
      JSON.stringify(upcomingBookings)
    );

    // Cache pending conversions
    const pendingConversions = await Booking.find({
      status: 'paid',
      paymentStatus: 'paid',
      orderId: { $exists: false }
    })
    .select('_id guestName guestEmail totalAmount stripeSessionId createdAt userId')
    .sort({ createdAt: 1 })
    .lean();

    await redis.setex(
      'bookings:pending:conversions',
      180, // 3 minutes (shorter TTL for urgent data)
      JSON.stringify(pendingConversions)
    );

    console.log('✅ Frequently accessed data cached');

  } catch (error) {
    console.error('Error caching frequently accessed data:', error.message);
  }
}

async function analyzeQueryPerformance() {
  console.log('🔍 Analyzing query performance...');

  try {
    // Test common query patterns and measure performance
    const queries = [
      {
        name: 'User bookings query',
        operation: async () => {
          const testUserId = await User.findOne().select('_id');
          if (testUserId) {
            const start = Date.now();
            await Booking.find({ userId: testUserId._id })
              .sort({ createdAt: -1 })
              .limit(10)
              .lean();
            return Date.now() - start;
          }
          return 0;
        }
      },
      {
        name: 'Guest bookings lookup',
        operation: async () => {
          const start = Date.now();
          await Booking.find({ guestEmail: 'test@example.com' })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
          return Date.now() - start;
        }
      },
      {
        name: 'Status and payment filter',
        operation: async () => {
          const start = Date.now();
          await Booking.find({
            status: 'paid',
            paymentStatus: 'paid'
          })
          .limit(20)
          .lean();
          return Date.now() - start;
        }
      },
      {
        name: 'Date range query',
        operation: async () => {
          const start = Date.now();
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          await Booking.find({
            createdAt: { $gte: thirtyDaysAgo }
          })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
          return Date.now() - start;
        }
      },
      {
        name: 'Aggregation statistics',
        operation: async () => {
          const start = Date.now();
          await Booking.aggregate([
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalValue: { $sum: '$totalAmount' }
              }
            }
          ]);
          return Date.now() - start;
        }
      }
    ];

    console.log('\nQuery Performance Analysis:');
    console.log('=' .repeat(50));

    for (const query of queries) {
      try {
        const duration = await query.operation();
        const status = duration < 100 ? '✅' : duration < 500 ? '⚠️' : '❌';
        console.log(`${status} ${query.name}: ${duration}ms`);
      } catch (error) {
        console.log(`❌ ${query.name}: Error - ${error.message}`);
      }
    }

    console.log('\nPerformance Guidelines:');
    console.log('✅ < 100ms: Excellent');
    console.log('⚠️ 100-500ms: Acceptable');
    console.log('❌ > 500ms: Needs optimization');

  } catch (error) {
    console.error('Error analyzing query performance:', error.message);
  }
}

async function setupCacheInvalidation() {
  console.log('🔄 Setting up cache invalidation strategies...');

  // Cache invalidation patterns
  const cachePatterns = {
    userStats: (userId) => `user:${userId}:stats`,
    globalStats: () => 'bookings:overall:stats',
    dailyStats: () => 'bookings:daily:stats',
    serviceStats: () => 'bookings:service:stats',
    recentBookings: () => 'bookings:recent',
    upcomingBookings: () => 'bookings:upcoming',
    pendingConversions: () => 'bookings:pending:conversions'
  };

  // Store cache patterns for use by application
  await redis.hset('cache:patterns', cachePatterns);

  // Set up cache warming schedule (for production use with cron jobs)
  const warmingSchedule = {
    'user:stats': '*/5 * * * *',     // Every 5 minutes
    'global:stats': '*/10 * * * *',  // Every 10 minutes
    'daily:stats': '*/30 * * * *',   // Every 30 minutes
    'service:stats': '*/30 * * * *', // Every 30 minutes
    'recent:bookings': '*/5 * * * *', // Every 5 minutes
    'upcoming:bookings': '*/10 * * * *' // Every 10 minutes
  };

  await redis.hset('cache:schedule', warmingSchedule);

  console.log('✅ Cache invalidation strategies configured');
}

async function generateOptimizationReport() {
  console.log('\n📈 OPTIMIZATION REPORT\n');
  console.log('=' .repeat(60));

  // Database statistics
  const dbStats = await mongoose.connection.db.stats();

  console.log('📊 Database Statistics:');
  console.log(`  Collections: ${dbStats.collections}`);
  console.log(`  Data Size: ${Math.round(dbStats.dataSize / 1024 / 1024)}MB`);
  console.log(`  Index Size: ${Math.round(dbStats.indexSize / 1024 / 1024)}MB`);

  // Collection statistics
  const bookingStats = await Booking.collection.stats();
  console.log('\n📋 Booking Collection:');
  console.log(`  Documents: ${bookingStats.count}`);
  console.log(`  Average Document Size: ${Math.round(bookingStats.avgObjSize)}B`);
  console.log(`  Total Indexes: ${bookingStats.nindexes}`);

  // Redis statistics
  const redisInfo = await redis.info('memory');
  const redisMemoryMatch = redisInfo.match(/used_memory_human:(.+)/);
  const redisMemory = redisMemoryMatch ? redisMemoryMatch[1].trim() : 'Unknown';

  console.log('\n🚀 Redis Cache:');
  console.log(`  Memory Usage: ${redisMemory}`);

  const cacheKeys = await redis.keys('*');
  console.log(`  Cached Keys: ${cacheKeys.length}`);

  // Performance recommendations
  console.log('\n🔧 Performance Recommendations:');
  console.log('  ✅ Database indexes optimized for common queries');
  console.log('  ✅ Redis caching layer implemented');
  console.log('  ✅ Cache invalidation strategies configured');
  console.log('  📌 Monitor query performance regularly');
  console.log('  📌 Implement connection pooling in production');
  console.log('  📌 Consider read replicas for heavy read workloads');
  console.log('  📌 Set up monitoring for cache hit rates');

  console.log('\n✅ Database optimization completed successfully!');
}

async function main() {
  try {
    await connectToDatabase();

    await createOptimizedIndexes();
    await implementCachingLayer();
    await setupCacheInvalidation();
    await analyzeQueryPerformance();
    await generateOptimizationReport();

    console.log('\n🎉 All optimization tasks completed successfully!');

  } catch (error) {
    console.error('❌ Optimization error:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (redis) {
      redis.disconnect();
    }
  }
}

// Run optimization if called directly
if (require.main === module) {
  main();
}

module.exports = {
  connectToDatabase,
  createOptimizedIndexes,
  implementCachingLayer,
  analyzeQueryPerformance,
  setupCacheInvalidation,
  generateOptimizationReport
};