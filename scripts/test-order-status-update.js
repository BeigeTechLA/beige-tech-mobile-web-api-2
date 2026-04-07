/**
 * Test script for automatic order status update based on shoot dates
 *
 * This script tests the updateOrderStatusByShootDate cron job function
 * to ensure it correctly updates order statuses based on shoot dates.
 *
 * Usage: node scripts/test-order-status-update.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/config');
const logger = require('../src/config/logger');
const { updateOrderStatusByShootDate } = require('../src/services/cron.service');

async function testOrderStatusUpdate() {
  try {
    logger.info('='.repeat(80));
    logger.info('TESTING ORDER STATUS UPDATE BY SHOOT DATE');
    logger.info('='.repeat(80));

    // Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Successfully connected to MongoDB');

    // Run the status update function
    logger.info('\nRunning updateOrderStatusByShootDate...\n');
    await updateOrderStatusByShootDate();

    logger.info('\n' + '='.repeat(80));
    logger.info('TEST COMPLETED SUCCESSFULLY');
    logger.info('='.repeat(80));

    // Disconnect from MongoDB
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    logger.error('Test failed with error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the test
testOrderStatusUpdate();
