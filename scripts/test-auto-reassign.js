/**
 * Test script for auto-reassignment functionality
 * This script helps test the automatic order reassignment when CP doesn't accept within 24 hours
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { checkAndReassignPendingOrders } = require('../src/services/cron.service');
const logger = require('../src/config/logger');

async function testAutoReassign() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Successfully Connected to MongoDB');

    // Run the reassignment check
    logger.info('Testing auto-reassignment functionality...');
    await checkAndReassignPendingOrders();
    logger.info('Test completed successfully');

    // Close connection
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Test failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

testAutoReassign();
