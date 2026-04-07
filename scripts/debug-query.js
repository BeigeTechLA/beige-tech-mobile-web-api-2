/**
 * Debug the query to see what's happening
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { Order } = require('../src/models');
const logger = require('../src/config/logger');

async function debugQuery() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Successfully Connected to MongoDB');

    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    logger.info(`Looking for orders assigned before: ${thirtySecondsAgo}`);
    logger.info('');

    // Find all test orders
    const allTestOrders = await Order.find({
      order_name: /Test Auto-Reassign/
    });

    logger.info(`Found ${allTestOrders.length} total test orders`);

    allTestOrders.forEach((order, index) => {
      logger.info(`\nOrder ${index + 1}: ${order.order_name}`);
      logger.info(`  ID: ${order._id}`);
      logger.info(`  Status: ${order.order_status}`);
      logger.info(`  CPs: ${order.cp_ids.length}`);
      order.cp_ids.forEach((cp, cpIndex) => {
        logger.info(`    CP ${cpIndex + 1}:`);
        logger.info(`      ID: ${cp.id}`);
        logger.info(`      Decision: ${cp.decision}`);
        logger.info(`      AssignedAt: ${cp.assignedAt}`);
        logger.info(`      Is Expired? ${new Date(cp.assignedAt) < thirtySecondsAgo}`);
      });
    });

    logger.info('\n--- Running the actual query ---');

    const ordersWithPendingCPs = await Order.find({
      order_status: { $ne: 'cancelled' },
      'cp_ids.decision': 'pending',
      'cp_ids.assignedAt': { $lt: thirtySecondsAgo },
    });

    logger.info(`Query found ${ordersWithPendingCPs.length} orders with expired pending CPs`);

    if (ordersWithPendingCPs.length > 0) {
      ordersWithPendingCPs.forEach((order, index) => {
        logger.info(`\nMatched Order ${index + 1}: ${order.order_name}`);
        logger.info(`  ID: ${order._id}`);
        order.cp_ids.forEach((cp, cpIndex) => {
          logger.info(`  CP ${cpIndex + 1}: ${cp.decision} - ${cp.assignedAt}`);
        });
      });
    }

    // Close connection
    await mongoose.connection.close();
    logger.info('\nMongoDB connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

debugQuery();
