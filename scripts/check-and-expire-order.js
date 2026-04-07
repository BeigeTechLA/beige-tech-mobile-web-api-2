/**
 * Find the most recent test order and set its assignedAt to be expired
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { Order } = require('../src/models');
const logger = require('../src/config/logger');

async function expireTestOrder() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Successfully Connected to MongoDB');

    // Find the most recent test order
    const testOrder = await Order.findOne({
      order_name: /Test Auto-Reassign Order/
    }).sort({ createdAt: -1 });

    if (!testOrder) {
      logger.error('No test order found');
      process.exit(1);
    }

    logger.info(`Found test order: ${testOrder.order_name} (${testOrder._id})`);
    logger.info(`Current CP assignment time: ${testOrder.cp_ids[0]?.assignedAt}`);

    // Set the assignedAt to 2 minutes ago (definitely expired)
    testOrder.cp_ids[0].assignedAt = new Date(Date.now() - 2 * 60 * 1000);
    await testOrder.save();

    logger.info(`✅ Updated assignment time to: ${testOrder.cp_ids[0].assignedAt}`);
    logger.info(`⏰ Assignment is now EXPIRED (2 minutes ago)`);
    logger.info('');
    logger.info('🔄 Now run the auto-reassignment test:');
    logger.info('   NODE_ENV=development node scripts/test-auto-reassign.js');

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

expireTestOrder();
