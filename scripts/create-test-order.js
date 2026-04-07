/**
 * Create a test order with an expired pending CP assignment
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { Order, User, CP } = require('../src/models');
const logger = require('../src/config/logger');

async function createTestOrder() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Successfully Connected to MongoDB');

    // Find CPs to assign to the test order
    const cps = await CP.find().limit(10).populate('userId');

    // Filter out CPs without a valid userId
    const validCps = cps.filter(cp => cp.userId && cp.userId._id);

    if (validCps.length < 2) {
      logger.error(`Need at least 2 CPs in the database to test auto-reassignment. Found ${validCps.length} valid CPs.`);
      process.exit(1);
    }

    logger.info(`Found ${validCps.length} valid CPs to test with`);

    // Find a client user, or any user if no client exists
    let client = await User.findOne({ role: 'client' });

    if (!client) {
      logger.warn('No client user found, using any available user');
      client = await User.findOne();
    }

    if (!client) {
      logger.error('No users found in database');
      process.exit(1);
    }

    logger.info(`Using client: ${client.name} (${client._id})`);

    // Create a test order with the first CP assigned 60 seconds ago (expired)
    const testOrder = await Order.create({
      client_id: client._id,
      cp_ids: [
        {
          id: validCps[0].userId._id,
          decision: 'pending',
          assignedAt: new Date(Date.now() - 60 * 1000), // 60 seconds ago - EXPIRED!
        }
      ],
      order_name: `Test Auto-Reassign Order ${Date.now()}`,
      order_status: 'pending',
      content_type: ['photography'],
      service_type: 'photography',
      location: 'Test Location',
      geo_location: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749], // San Francisco
      },
      budget: {
        min: 100,
        max: 500,
        suggested: 300,
      },
      shoot_cost: 300,
      description: 'Test order for auto-reassignment feature',
    });

    logger.info('✅ Test order created successfully!');
    logger.info(`Order ID: ${testOrder._id}`);
    logger.info(`Order Name: ${testOrder.order_name}`);
    logger.info(`Assigned CP: ${validCps[0].userId.name} (${validCps[0].userId._id})`);
    logger.info(`Assignment time: ${testOrder.cp_ids[0].assignedAt}`);
    logger.info(`Status: ${testOrder.cp_ids[0].decision}`);
    logger.info('');
    logger.info('⏰ This CP assignment is EXPIRED (assigned 60 seconds ago)');
    logger.info('');
    logger.info('Available CPs for reassignment:');
    validCps.slice(1).forEach((cp, index) => {
      logger.info(`  ${index + 2}. ${cp.userId.name} (${cp.userId._id})`);
    });
    logger.info('');
    logger.info('🔄 Run the test script to trigger auto-reassignment:');
    logger.info('   NODE_ENV=development node scripts/test-auto-reassign.js');

    // Close connection
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create test order:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

createTestOrder();
