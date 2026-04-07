/**
 * Verify that auto-reassignment worked
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { Order } = require('../src/models');
const logger = require('../src/config/logger');

async function verifyReassignment() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Successfully Connected to MongoDB');

    // Find all test orders
    const testOrders = await Order.find({
      order_name: /Test Auto-Reassign/
    }).sort({ createdAt: -1 }).populate('cp_ids.id', 'name _id');

    logger.info(`Found ${testOrders.length} test orders\n`);

    testOrders.forEach((order, index) => {
      logger.info(`========================================`);
      logger.info(`Order ${index + 1}: ${order.order_name}`);
      logger.info(`ID: ${order._id}`);
      logger.info(`Status: ${order.order_status}`);
      logger.info(`Created: ${order.createdAt}`);
      logger.info(`\nContent Providers (${order.cp_ids.length}):`);

      order.cp_ids.forEach((cp, cpIndex) => {
        const cpName = cp.id?.name || 'Unknown';
        const cpId = cp.id?._id ||  cp.id;
        logger.info(`\n  CP ${cpIndex + 1}:`);
        logger.info(`    Name: ${cpName}`);
        logger.info(`    ID: ${cpId}`);
        logger.info(`    Decision: ${cp.decision}`);
        logger.info(`    Assigned At: ${cp.assignedAt}`);
      });

      if (order.cp_ids.length > 1) {
        logger.info(`\n✅ AUTO-REASSIGNMENT DETECTED!`);
        logger.info(`   Original CP (cancelled): ${order.cp_ids[0].id?.name}`);
        logger.info(`   New CP (pending): ${order.cp_ids[order.cp_ids.length - 1].id?.name}`);
      } else if (order.cp_ids[0]?.decision === 'cancelled' && order.cp_ids.length === 1) {
        logger.info(`\n❌ CP was cancelled but NO reassignment occurred`);
        logger.info(`   This could mean no other CPs are available`);
      }

      logger.info('');
    });

    // Close connection
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

verifyReassignment();
