const EventEmitter = require('events');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Booking = require('../../src/models/booking.model');
const User = require('../../src/models/user.model');

/**
 * Memory Leak Detection Test for Long-Running Booking Operations
 * Monitors memory usage during sustained booking creation and processing
 */

class MemoryLeakTester extends EventEmitter {
  constructor() {
    super();
    this.memorySnapshots = [];
    this.testDuration = 5 * 60 * 1000; // 5 minutes
    this.intervalMs = 10000; // Take snapshot every 10 seconds
    this.startMemory = null;
    this.mongoServer = null;
  }

  async setup() {
    console.log('🔍 Setting up memory leak test environment...');

    // Start in-memory MongoDB
    this.mongoServer = await MongoMemoryServer.create();
    const mongoUri = this.mongoServer.getUri();

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Create test user
    this.testUser = await User.create({
      email: 'memoryleak@test.com',
      firstName: 'Memory',
      lastName: 'Test',
      password: 'memoryTestPassword123',
      role: 'client'
    });

    console.log('✅ Memory leak test environment ready');
  }

  async cleanup() {
    console.log('🧹 Cleaning up memory leak test environment...');

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }

    if (this.mongoServer) {
      await this.mongoServer.stop();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  takeMemorySnapshot() {
    const usage = process.memoryUsage();
    const timestamp = Date.now();

    const snapshot = {
      timestamp,
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers
    };

    this.memorySnapshots.push(snapshot);

    console.log(`📊 Memory snapshot ${this.memorySnapshots.length}: ` +
      `RSS: ${Math.round(usage.rss / 1024 / 1024)}MB, ` +
      `Heap: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);

    return snapshot;
  }

  async createBookingBatch(batchSize = 100) {
    const bookings = [];

    for (let i = 0; i < batchSize; i++) {
      const booking = await Booking.create({
        userId: Math.random() > 0.5 ? this.testUser._id : null,
        guestName: `Memory Test Booking ${i}`,
        guestEmail: `memory${i}@test.com`,
        guestPhone: `+1555${String(i).padStart(6, '0')}`,
        serviceType: ['videography', 'photography', 'editing_only'][i % 3],
        contentType: [['video'], ['photo'], ['edit']][i % 3],
        startDateTime: new Date(Date.now() + (i * 60 * 60 * 1000)),
        endDateTime: new Date(Date.now() + (i * 60 * 60 * 1000) + (60 * 60 * 1000)),
        durationHours: Math.ceil(Math.random() * 4),
        location: `Memory Test Location ${i}`,
        budget: 100 + (i * 5),
        status: ['pending', 'confirmed', 'paid'][i % 3],
        paymentStatus: ['pending', 'paid', 'failed'][i % 3]
      });

      bookings.push(booking);
    }

    return bookings;
  }

  async simulateBookingQueries(queryCount = 50) {
    const queries = [];

    for (let i = 0; i < queryCount; i++) {
      // Simulate various query patterns
      queries.push(
        Booking.find({ status: 'confirmed' }).limit(10).lean(),
        Booking.find({ userId: this.testUser._id }).sort({ createdAt: -1 }).limit(5),
        Booking.countDocuments({ paymentStatus: 'paid' }),
        Booking.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      );
    }

    await Promise.all(queries);
  }

  async runMemoryLeakTest() {
    console.log('🔍 Starting memory leak detection test...');
    console.log(`Duration: ${this.testDuration / 1000}s, Interval: ${this.intervalMs / 1000}s`);

    await this.setup();

    // Take initial memory snapshot
    this.startMemory = this.takeMemorySnapshot();

    let operationCount = 0;
    const startTime = Date.now();

    // Start memory monitoring
    const memoryInterval = setInterval(() => {
      this.takeMemorySnapshot();
    }, this.intervalMs);

    // Start sustained operations
    const operationInterval = setInterval(async () => {
      try {
        // Create bookings
        await this.createBookingBatch(50);

        // Perform queries
        await this.simulateBookingQueries(25);

        // Delete some old bookings to simulate cleanup
        const oldBookings = await Booking.find({})
          .sort({ createdAt: 1 })
          .limit(25);

        if (oldBookings.length > 0) {
          await Booking.deleteMany({
            _id: { $in: oldBookings.map(b => b._id) }
          });
        }

        operationCount++;
        console.log(`🔄 Completed operation cycle ${operationCount}`);

      } catch (error) {
        console.error('❌ Error during operation cycle:', error);
      }
    }, 5000); // Every 5 seconds

    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, this.testDuration));

    // Stop intervals
    clearInterval(memoryInterval);
    clearInterval(operationInterval);

    // Take final snapshot
    const endMemory = this.takeMemorySnapshot();

    // Analyze results
    const results = this.analyzeMemoryLeaks();

    await this.cleanup();

    return results;
  }

  analyzeMemoryLeaks() {
    console.log('\n🔍 MEMORY LEAK ANALYSIS\n');
    console.log('=' .repeat(60));

    if (this.memorySnapshots.length < 2) {
      console.log('❌ Insufficient memory snapshots for analysis');
      return { hasLeaks: false, analysis: 'Insufficient data' };
    }

    const start = this.memorySnapshots[0];
    const end = this.memorySnapshots[this.memorySnapshots.length - 1];

    const rssDiff = end.rss - start.rss;
    const heapDiff = end.heapUsed - start.heapUsed;
    const durationMinutes = (end.timestamp - start.timestamp) / 60000;

    console.log(`Test Duration: ${durationMinutes.toFixed(1)} minutes`);
    console.log(`RSS Memory Change: ${Math.round(rssDiff / 1024 / 1024)}MB`);
    console.log(`Heap Memory Change: ${Math.round(heapDiff / 1024 / 1024)}MB`);

    // Calculate memory growth trend
    const memoryGrowthTrend = this.calculateMemoryGrowthTrend();

    console.log(`\nMemory Growth Trend: ${memoryGrowthTrend.slope.toFixed(2)} MB/minute`);

    // Determine if there are potential leaks
    const rssGrowthRate = rssDiff / durationMinutes; // MB per minute
    const heapGrowthRate = heapDiff / durationMinutes; // MB per minute

    const hasSignificantRSSGrowth = rssGrowthRate > 5; // More than 5MB/min
    const hasSignificantHeapGrowth = heapGrowthRate > 3; // More than 3MB/min
    const hasConsistentGrowth = memoryGrowthTrend.slope > 2; // Consistent upward trend

    const hasLeaks = hasSignificantRSSGrowth || hasSignificantHeapGrowth || hasConsistentGrowth;

    console.log(`\nRSS Growth Rate: ${rssGrowthRate.toFixed(2)} MB/min`);
    console.log(`Heap Growth Rate: ${heapGrowthRate.toFixed(2)} MB/min`);
    console.log(`Consistent Growth: ${hasConsistentGrowth ? 'Yes' : 'No'}`);

    if (hasLeaks) {
      console.log('\n⚠️  POTENTIAL MEMORY LEAKS DETECTED');
      console.log('\nRecommendations:');
      console.log('- Review database connection handling');
      console.log('- Check for unclosed event listeners');
      console.log('- Verify proper cleanup of temporary objects');
      console.log('- Monitor MongoDB connection pooling');
      console.log('- Consider implementing memory limits');
    } else {
      console.log('\n✅ NO SIGNIFICANT MEMORY LEAKS DETECTED');
    }

    // Generate detailed snapshot analysis
    this.generateSnapshotAnalysis();

    return {
      hasLeaks,
      rssGrowthRate,
      heapGrowthRate,
      memoryGrowthTrend,
      snapshots: this.memorySnapshots.length,
      durationMinutes
    };
  }

  calculateMemoryGrowthTrend() {
    // Linear regression to find memory growth trend
    const points = this.memorySnapshots.map((snapshot, index) => ({
      x: index,
      y: snapshot.heapUsed / 1024 / 1024 // Convert to MB
    }));

    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + (p.x * p.y), 0);
    const sumXX = points.reduce((sum, p) => sum + (p.x * p.x), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  generateSnapshotAnalysis() {
    console.log('\n📊 MEMORY SNAPSHOT ANALYSIS\n');

    // Find peak memory usage
    const peakRSS = Math.max(...this.memorySnapshots.map(s => s.rss));
    const peakHeap = Math.max(...this.memorySnapshots.map(s => s.heapUsed));

    console.log(`Peak RSS: ${Math.round(peakRSS / 1024 / 1024)}MB`);
    console.log(`Peak Heap: ${Math.round(peakHeap / 1024 / 1024)}MB`);

    // Calculate variance to detect memory spikes
    const heapValues = this.memorySnapshots.map(s => s.heapUsed);
    const mean = heapValues.reduce((sum, val) => sum + val, 0) / heapValues.length;
    const variance = heapValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / heapValues.length;
    const stdDev = Math.sqrt(variance);

    console.log(`Memory Stability (std dev): ${Math.round(stdDev / 1024 / 1024)}MB`);

    if (stdDev > 50 * 1024 * 1024) { // More than 50MB standard deviation
      console.log('⚠️  High memory variance detected - possible memory spikes');
    }
  }
}

/**
 * Run memory leak detection test
 */
async function runMemoryLeakTest() {
  const tester = new MemoryLeakTester();

  try {
    const results = await tester.runMemoryLeakTest();

    // Exit with appropriate code
    process.exit(results.hasLeaks ? 1 : 0);

  } catch (error) {
    console.error('❌ Memory leak test error:', error);
    await tester.cleanup();
    process.exit(1);
  }
}

// Run memory leak test if called directly
if (require.main === module) {
  runMemoryLeakTest();
}

module.exports = {
  MemoryLeakTester,
  runMemoryLeakTest
};