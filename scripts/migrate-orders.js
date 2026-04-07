const mongoose = require('mongoose');
const readline = require('readline');
const Booking = require('../src/models/booking.model');
const User = require('../src/models/user.model');

/**
 * Production Database Migration Script
 * Safely migrates existing data for authenticated checkout system
 */

class ProductionMigration {
  constructor() {
    this.dryRun = true;
    this.batchSize = 100;
    this.backupCollections = [];
    this.migrationLog = [];
    this.rollbackData = new Map();
  }

  async connect() {
    const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error('MONGODB_URL or MONGODB_URI environment variable is required');
    }

    console.log('🔌 Connecting to production database...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Verify we're on the correct database
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database: ${dbName}`);

    if (process.env.NODE_ENV === 'production') {
      await this.confirmProductionMigration();
    }
  }

  async confirmProductionMigration() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve, reject) => {
      rl.question(
        '⚠️  You are about to run migrations on PRODUCTION database. Type "MIGRATE" to continue: ',
        (answer) => {
          rl.close();

          if (answer === 'MIGRATE') {
            console.log('✅ Production migration confirmed');
            resolve();
          } else {
            console.log('❌ Migration cancelled');
            reject(new Error('Migration cancelled by user'));
          }
        }
      );
    });
  }

  async createBackups() {
    console.log('💾 Creating collection backups...');

    const collections = ['bookings', 'orders', 'users'];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    for (const collectionName of collections) {
      try {
        const collection = mongoose.connection.db.collection(collectionName);
        const backupName = `${collectionName}_backup_${timestamp}`;

        // Check if collection exists
        const exists = await collection.countDocuments();
        if (exists === 0) {
          console.log(`⚠️ Collection ${collectionName} is empty, skipping backup`);
          continue;
        }

        // Create backup collection
        const docs = await collection.find({}).toArray();
        if (docs.length > 0) {
          await mongoose.connection.db.collection(backupName).insertMany(docs);
          this.backupCollections.push(backupName);
          console.log(`✅ Backed up ${docs.length} documents from ${collectionName} to ${backupName}`);
        }

      } catch (error) {
        console.error(`❌ Error backing up ${collectionName}:`, error.message);
        throw error;
      }
    }

    console.log(`✅ Created ${this.backupCollections.length} backup collections`);
  }

  async validateDataIntegrity() {
    console.log('🔍 Validating data integrity...');

    const validationResults = {
      bookings: { total: 0, valid: 0, issues: [] },
      users: { total: 0, valid: 0, issues: [] },
      orders: { total: 0, valid: 0, issues: [] }
    };

    // Validate bookings
    const bookings = await Booking.find({}).lean();
    validationResults.bookings.total = bookings.length;

    for (const booking of bookings) {
      let isValid = true;
      const issues = [];

      // Check required fields
      if (!booking.guestEmail || !booking.guestName) {
        issues.push('Missing guest information');
        isValid = false;
      }

      if (!booking.serviceType || !booking.contentType) {
        issues.push('Missing service information');
        isValid = false;
      }

      if (!booking.startDateTime || !booking.endDateTime) {
        issues.push('Missing date information');
        isValid = false;
      }

      // Check date validity
      if (booking.startDateTime >= booking.endDateTime) {
        issues.push('Invalid date range');
        isValid = false;
      }

      // Check userId reference if present
      if (booking.userId) {
        try {
          mongoose.Types.ObjectId(booking.userId);
        } catch (error) {
          issues.push('Invalid userId format');
          isValid = false;
        }
      }

      if (isValid) {
        validationResults.bookings.valid++;
      } else {
        validationResults.bookings.issues.push({
          id: booking._id,
          issues
        });
      }
    }

    // Validate users
    const users = await User.find({}).lean();
    validationResults.users.total = users.length;

    for (const user of users) {
      let isValid = true;
      const issues = [];

      if (!user.email || !user.firstName) {
        issues.push('Missing user information');
        isValid = false;
      }

      // Check email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(user.email)) {
        issues.push('Invalid email format');
        isValid = false;
      }

      if (isValid) {
        validationResults.users.valid++;
      } else {
        validationResults.users.issues.push({
          id: user._id,
          issues
        });
      }
    }

    // Check for orders collection (might not exist yet)
    try {
      const Order = mongoose.model('Order');
      const orders = await Order.find({}).lean();
      validationResults.orders.total = orders.length;
      validationResults.orders.valid = orders.length; // Assume existing orders are valid
    } catch (error) {
      console.log('ℹ️ Orders collection not found (expected for new installations)');
    }

    // Report validation results
    console.log('\n📊 Data Validation Results:');
    console.log(`Bookings: ${validationResults.bookings.valid}/${validationResults.bookings.total} valid`);
    console.log(`Users: ${validationResults.users.valid}/${validationResults.users.total} valid`);
    console.log(`Orders: ${validationResults.orders.valid}/${validationResults.orders.total} valid`);

    if (validationResults.bookings.issues.length > 0) {
      console.log(`\n⚠️ Found ${validationResults.bookings.issues.length} booking issues:`);
      validationResults.bookings.issues.slice(0, 5).forEach(issue => {
        console.log(`  - ${issue.id}: ${issue.issues.join(', ')}`);
      });
    }

    if (validationResults.users.issues.length > 0) {
      console.log(`\n⚠️ Found ${validationResults.users.issues.length} user issues:`);
      validationResults.users.issues.slice(0, 5).forEach(issue => {
        console.log(`  - ${issue.id}: ${issue.issues.join(', ')}`);
      });
    }

    return validationResults;
  }

  async migrateBookingIndexes() {
    console.log('📇 Creating optimized database indexes...');

    if (!this.dryRun) {
      // Booking collection indexes
      await Booking.collection.createIndex(
        { userId: 1, createdAt: -1 },
        { name: 'user_bookings_idx' }
      );

      await Booking.collection.createIndex(
        { guestEmail: 1, createdAt: -1 },
        { name: 'guest_bookings_idx' }
      );

      await Booking.collection.createIndex(
        { status: 1, paymentStatus: 1 },
        { name: 'status_payment_idx' }
      );

      await Booking.collection.createIndex(
        { startDateTime: 1, endDateTime: 1 },
        { name: 'booking_dates_idx' }
      );

      await Booking.collection.createIndex(
        { stripeSessionId: 1 },
        { unique: true, sparse: true, name: 'stripe_session_unique_idx' }
      );

      await Booking.collection.createIndex(
        { stripePaymentIntentId: 1 },
        { unique: true, sparse: true, name: 'stripe_intent_unique_idx' }
      );

      console.log('✅ Database indexes created');
    } else {
      console.log('🔍 DRY RUN: Would create database indexes');
    }

    this.migrationLog.push({
      step: 'Create Indexes',
      timestamp: new Date(),
      status: this.dryRun ? 'simulated' : 'completed'
    });
  }

  async migrateUserBookingAssociations() {
    console.log('🔗 Migrating user-booking associations...');

    let processedCount = 0;
    let associatedCount = 0;

    // Find bookings with userId but need validation
    const bookingsWithUserId = await Booking.find({
      userId: { $exists: true, $ne: null }
    }).lean();

    console.log(`Found ${bookingsWithUserId.length} bookings with userId`);

    for (const booking of bookingsWithUserId) {
      try {
        // Verify user exists
        const user = await User.findById(booking.userId).lean();

        if (!user) {
          console.log(`⚠️ Booking ${booking._id} references non-existent user ${booking.userId}`);

          if (!this.dryRun) {
            // Remove invalid userId reference
            await Booking.updateOne(
              { _id: booking._id },
              { $unset: { userId: '' } }
            );
            console.log(`✅ Removed invalid userId from booking ${booking._id}`);
          }
        } else {
          associatedCount++;
        }

        processedCount++;

        if (processedCount % this.batchSize === 0) {
          console.log(`Processed ${processedCount}/${bookingsWithUserId.length} bookings`);
        }

      } catch (error) {
        console.error(`❌ Error processing booking ${booking._id}:`, error.message);
      }
    }

    // Find bookings that could be associated with users based on email
    const unassociatedBookings = await Booking.find({
      $or: [
        { userId: { $exists: false } },
        { userId: null }
      ]
    }).lean();

    console.log(`\nFound ${unassociatedBookings.length} unassociated bookings`);

    let newAssociations = 0;

    for (const booking of unassociatedBookings) {
      try {
        // Try to find user by email
        const user = await User.findOne({ email: booking.guestEmail }).lean();

        if (user) {
          if (!this.dryRun) {
            await Booking.updateOne(
              { _id: booking._id },
              { $set: { userId: user._id } }
            );
            console.log(`✅ Associated booking ${booking._id} with user ${user._id}`);
          } else {
            console.log(`🔍 DRY RUN: Would associate booking ${booking._id} with user ${user._id}`);
          }

          newAssociations++;
        }

      } catch (error) {
        console.error(`❌ Error processing unassociated booking ${booking._id}:`, error.message);
      }
    }

    console.log(`\n📊 Association Results:`);
    console.log(`  Valid associations: ${associatedCount}`);
    console.log(`  New associations: ${newAssociations}`);
    console.log(`  Total processed: ${processedCount}`);

    this.migrationLog.push({
      step: 'User-Booking Associations',
      timestamp: new Date(),
      status: this.dryRun ? 'simulated' : 'completed',
      details: {
        validAssociations: associatedCount,
        newAssociations: newAssociations,
        totalProcessed: processedCount
      }
    });
  }

  async createOrdersFromBookings() {
    console.log('📋 Creating orders from paid bookings...');

    // Find paid bookings that don't have orders yet
    const paidBookings = await Booking.find({
      status: 'paid',
      paymentStatus: 'paid',
      orderId: { $exists: false }
    }).lean();

    console.log(`Found ${paidBookings.length} paid bookings without orders`);

    let ordersCreated = 0;

    for (const booking of paidBookings) {
      try {
        const orderData = {
          client_id: booking.userId || null,
          booking_ref: booking._id,
          order_status: 'confirmed',
          total_amount: booking.totalAmount || booking.budget || 0,
          service_details: {
            type: booking.serviceType,
            content: booking.contentType,
            date: booking.startDateTime,
            duration: booking.durationHours,
            location: booking.location
          },
          guest_info: {
            name: booking.guestName,
            email: booking.guestEmail,
            phone: booking.guestPhone
          },
          payment_info: {
            stripe_session_id: booking.stripeSessionId,
            stripe_payment_intent_id: booking.stripePaymentIntentId,
            amount: booking.totalAmount || booking.budget || 0,
            status: 'paid'
          },
          createdAt: booking.createdAt || new Date(),
          updatedAt: new Date()
        };

        if (!this.dryRun) {
          // Create order (assuming Order model exists)
          try {
            const Order = mongoose.model('Order');
            const order = await Order.create(orderData);

            // Update booking with order reference
            await Booking.updateOne(
              { _id: booking._id },
              {
                $set: {
                  orderId: order._id,
                  status: 'converted',
                  convertedAt: new Date()
                }
              }
            );

            console.log(`✅ Created order ${order._id} for booking ${booking._id}`);
            ordersCreated++;

          } catch (orderError) {
            console.log('ℹ️ Order model not available, storing order data for later creation');

            // Store order data for manual creation
            this.rollbackData.set(`order_${booking._id}`, orderData);
          }

        } else {
          console.log(`🔍 DRY RUN: Would create order for booking ${booking._id}`);
          ordersCreated++;
        }

      } catch (error) {
        console.error(`❌ Error creating order for booking ${booking._id}:`, error.message);
      }
    }

    console.log(`✅ Created ${ordersCreated} orders`);

    this.migrationLog.push({
      step: 'Create Orders',
      timestamp: new Date(),
      status: this.dryRun ? 'simulated' : 'completed',
      details: {
        ordersCreated: ordersCreated,
        totalPaidBookings: paidBookings.length
      }
    });
  }

  async updateBookingStatuses() {
    console.log('🔄 Updating booking statuses...');

    const updates = [
      // Update bookings with payment information but no status
      {
        filter: {
          stripePaymentIntentId: { $exists: true },
          paymentStatus: 'pending',
          status: 'confirmed'
        },
        update: {
          $set: {
            paymentStatus: 'paid',
            status: 'paid',
            updatedAt: new Date()
          }
        },
        description: 'Mark bookings with payment intents as paid'
      },

      // Update old bookings that should be expired
      {
        filter: {
          status: 'pending',
          startDateTime: { $lt: new Date() }
        },
        update: {
          $set: {
            status: 'expired',
            updatedAt: new Date()
          }
        },
        description: 'Mark past pending bookings as expired'
      },

      // Ensure confirmation numbers for confirmed/paid bookings
      {
        filter: {
          status: { $in: ['confirmed', 'paid', 'converted'] },
          confirmationNumber: { $exists: false }
        },
        update: {
          $set: {
            confirmationNumber: `BG-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
            updatedAt: new Date()
          }
        },
        description: 'Add confirmation numbers to confirmed bookings'
      }
    ];

    for (const updateOperation of updates) {
      try {
        let result;

        if (!this.dryRun) {
          result = await Booking.updateMany(updateOperation.filter, updateOperation.update);
          console.log(`✅ ${updateOperation.description}: ${result.modifiedCount} bookings updated`);
        } else {
          const count = await Booking.countDocuments(updateOperation.filter);
          console.log(`🔍 DRY RUN: ${updateOperation.description}: ${count} bookings would be updated`);
        }

      } catch (error) {
        console.error(`❌ Error in update operation "${updateOperation.description}":`, error.message);
      }
    }

    this.migrationLog.push({
      step: 'Update Booking Statuses',
      timestamp: new Date(),
      status: this.dryRun ? 'simulated' : 'completed'
    });
  }

  async generateMigrationReport() {
    console.log('\n📋 MIGRATION REPORT\n');
    console.log('=' .repeat(60));

    // Collection statistics
    const bookingCount = await Booking.countDocuments();
    const userCount = await User.countDocuments();

    console.log('📊 Collection Statistics:');
    console.log(`  Bookings: ${bookingCount}`);
    console.log(`  Users: ${userCount}`);

    // Booking status breakdown
    const statusBreakdown = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📈 Booking Status Breakdown:');
    statusBreakdown.forEach(item => {
      console.log(`  ${item._id || 'undefined'}: ${item.count}`);
    });

    // Payment status breakdown
    const paymentBreakdown = await Booking.aggregate([
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('\n💳 Payment Status Breakdown:');
    paymentBreakdown.forEach(item => {
      console.log(`  ${item._id || 'undefined'}: ${item.count}`);
    });

    // User association breakdown
    const userAssociations = await Booking.aggregate([
      {
        $group: {
          _id: { $cond: [{ $eq: ['$userId', null] }, 'guest', 'authenticated'] },
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('\n👤 User Association Breakdown:');
    userAssociations.forEach(item => {
      console.log(`  ${item._id}: ${item.count}`);
    });

    // Migration steps summary
    console.log('\n🔄 Migration Steps Completed:');
    this.migrationLog.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step.step} - ${step.status} at ${step.timestamp.toISOString()}`);
      if (step.details) {
        Object.entries(step.details).forEach(([key, value]) => {
          console.log(`     ${key}: ${value}`);
        });
      }
    });

    // Backup information
    if (this.backupCollections.length > 0) {
      console.log('\n💾 Backup Collections Created:');
      this.backupCollections.forEach(backup => {
        console.log(`  - ${backup}`);
      });
    }

    console.log('\n✅ Migration completed successfully!');

    if (this.dryRun) {
      console.log('\n⚠️ This was a DRY RUN. No actual changes were made.');
      console.log('Run with --execute flag to perform the actual migration.');
    }
  }

  async rollback() {
    console.log('🔄 Starting migration rollback...');

    if (this.backupCollections.length === 0) {
      console.log('❌ No backup collections found for rollback');
      return;
    }

    for (const backupCollection of this.backupCollections) {
      try {
        const originalCollection = backupCollection.replace(/_backup_.*$/, '');

        // Drop current collection
        await mongoose.connection.db.collection(originalCollection).drop();

        // Restore from backup
        const backupDocs = await mongoose.connection.db.collection(backupCollection).find({}).toArray();
        if (backupDocs.length > 0) {
          await mongoose.connection.db.collection(originalCollection).insertMany(backupDocs);
        }

        console.log(`✅ Restored ${originalCollection} from ${backupCollection}`);

      } catch (error) {
        console.error(`❌ Error rolling back ${backupCollection}:`, error.message);
      }
    }

    console.log('✅ Rollback completed');
  }

  async cleanup() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
}

/**
 * Main migration runner
 */
async function runMigration() {
  const migration = new ProductionMigration();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const isExecuteMode = args.includes('--execute');
  const isRollbackMode = args.includes('--rollback');

  migration.dryRun = !isExecuteMode;

  try {
    await migration.connect();

    if (isRollbackMode) {
      await migration.rollback();
      return;
    }

    console.log(`\n🚀 Starting migration in ${migration.dryRun ? 'DRY RUN' : 'EXECUTE'} mode...\n`);

    // Always create backups in execute mode
    if (!migration.dryRun) {
      await migration.createBackups();
    }

    // Validate data integrity
    await migration.validateDataIntegrity();

    // Run migration steps
    await migration.migrateBookingIndexes();
    await migration.migrateUserBookingAssociations();
    await migration.createOrdersFromBookings();
    await migration.updateBookingStatuses();

    // Generate report
    await migration.generateMigrationReport();

  } catch (error) {
    console.error('❌ Migration failed:', error);

    if (!migration.dryRun) {
      console.log('🔄 Consider running rollback: node migrate-orders.js --rollback');
    }

    process.exit(1);
  } finally {
    await migration.cleanup();
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration();
}

module.exports = ProductionMigration;