const { Order, Booking } = require('../models');
const logger = require('../config/logger');
const { sendNotification } = require('./fcm.service');
const notificationService = require('./notification.service');
const cpService = require('./cp.service');

/**
 * Check for orders where CP hasn't accepted within 3 hours and reassign to next ranked CP
 * This cron job runs every hour to check pending orders
 */
const checkAndReassignPendingOrders = async () => {
  try {
    logger.info('Running cron job: checkAndReassignPendingOrders');

    // Find orders with pending CPs that were assigned more than 3 hours ago
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const ordersWithPendingCPs = await Order.find({
      order_status: { $ne: 'cancelled' },
      'cp_ids.decision': 'pending',
      'cp_ids.assignedAt': { $lt: threeHoursAgo },
    }).populate('client_id');

    logger.info(`Found ${ordersWithPendingCPs.length} orders with expired pending CPs`);

    for (const order of ordersWithPendingCPs) {
      try {
        await reassignOrderToNextCP(order);
      } catch (error) {
        logger.error(`Error reassigning order ${order._id}:`, error);
      }
    }

    logger.info('Completed cron job: checkAndReassignPendingOrders');
  } catch (error) {
    logger.error('Error in checkAndReassignPendingOrders cron job:', error);
  }
};

/**
 * Reassign order to the next ranked CP when current CP hasn't accepted within 3 hours
 * @param {Object} order - The order document
 */
const reassignOrderToNextCP = async (order) => {
  try {
    // Check for CPs assigned more than 3 hours ago
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    // Find CPs that are pending and assigned more than 3 hours ago
    const expiredPendingCPs = order.cp_ids.filter(
      (cp) => cp.decision === 'pending' && new Date(cp.assignedAt) < threeHoursAgo
    );

    if (expiredPendingCPs.length === 0) {
      return;
    }

    logger.info(`Order ${order._id} has ${expiredPendingCPs.length} expired pending CPs`);

    // Check if there's already an accepted CP
    const hasAcceptedCP = order.cp_ids.some((cp) => cp.decision === 'accepted');

    if (hasAcceptedCP) {
      // If there's already an accepted CP, just cancel the pending ones
      for (const expiredCP of expiredPendingCPs) {
        const cpIndex = order.cp_ids.findIndex((cp) => cp.id.toString() === expiredCP.id.toString());
        if (cpIndex !== -1) {
          order.cp_ids[cpIndex].decision = 'cancelled';
        }
      }
      await order.save();
      logger.info(`Order ${order._id}: Cancelled expired pending CPs as order already has accepted CP`);
      return;
    }

    // No accepted CP yet, so reassign to next ranked CP
    // Get all current CP IDs to exclude them from the search
    const currentCPIds = order.cp_ids.map((cp) => cp.id.toString());

    // Determine content type for finding next CP
    let contentType = 'both';
    if (order.content_type && order.content_type.length > 0) {
      const firstType = order.content_type[0];
      if (['photo', 'photography'].includes(firstType)) {
        contentType = 'photography';
      } else if (['video', 'videography'].includes(firstType)) {
        contentType = 'videography';
      } else if (firstType === 'both') {
        contentType = 'both';
      }
    }

    // Find ranked CPs excluding already assigned ones
    logger.info(`Order ${order._id}: Searching for CPs with contentType=${contentType}, budget=${order.budget?.min}-${order.budget?.max}`);

    const rankedCPs = await cpService.findCpsByContentAndBudgetWithRanking({
      contentType,
      minBudget: order.budget?.min || 0,
      maxBudget: order.budget?.max || 999999,
      lat: order.geo_location?.coordinates?.[1] || null,
      lng: order.geo_location?.coordinates?.[0] || null,
      maxDistance: 100, // 100km radius
      minRating: null,
      minAcceptanceRate: null,
      minTrustScore: null,
      tier: null,
      maxInactiveDays: null,
      sortBy: 'ranking',
      sortOrder: 'desc',
    });

    logger.info(`Order ${order._id}: Found ${rankedCPs.length} ranked CPs`);

    // Filter out already assigned CPs and find the next available one
    const availableCPs = rankedCPs.filter((cp) => {
      const cpUserId = cp.userId?._id?.toString() || cp.userId?.toString() || cp._id?.toString();
      const isAlreadyAssigned = currentCPIds.includes(cpUserId);
      return !isAlreadyAssigned;
    });

    logger.info(`Order ${order._id}: ${availableCPs.length} CPs available after filtering already assigned`);

    if (availableCPs.length === 0) {
      logger.warn(`Order ${order._id}: No available CPs to reassign`);
      // Cancel the expired pending CPs
      for (const expiredCP of expiredPendingCPs) {
        const cpIndex = order.cp_ids.findIndex((cp) => cp.id.toString() === expiredCP.id.toString());
        if (cpIndex !== -1) {
          order.cp_ids[cpIndex].decision = 'cancelled';
        }
      }
      await order.save();
      return;
    }

    // Get the next ranked CP
    const nextCP = availableCPs[0];
    const nextCPId = nextCP.userId?._id || nextCP.userId || nextCP._id;

    logger.info(`Order ${order._id}: Reassigning to next CP ${nextCPId} (rank score: ${nextCP.rankingScore})`);

    // Cancel the expired pending CPs
    for (const expiredCP of expiredPendingCPs) {
      const cpIndex = order.cp_ids.findIndex((cp) => cp.id.toString() === expiredCP.id.toString());
      if (cpIndex !== -1) {
        order.cp_ids[cpIndex].decision = 'cancelled';

        // Send notification to the CP that their assignment was cancelled
        const cancelNotificationTitle = 'Order Assignment Expired';
        const cancelNotificationContent = `Your assignment for "${order.order_name}" has expired due to no response within 3 hours.`;

        sendNotification(expiredCP.id.toString(), cancelNotificationTitle, cancelNotificationContent, {
          type: 'orderExpired',
          order_id: order._id.toString(),
          order_name: order.order_name,
        });

        await notificationService.insertNotification({
          modelName: 'orderExpired',
          modelId: order._id,
          cpIds: [expiredCP.id],
          category: 'orderExpired',
          message: cancelNotificationContent,
          metadata: {
            title: cancelNotificationTitle,
            type: 'orderExpired',
            order_id: order._id.toString(),
            order_name: order.order_name,
          },
        });
      }
    }

    // Add the new CP with pending status
    order.cp_ids.push({
      id: nextCPId,
      decision: 'pending',
      assignedAt: new Date(),
    });

    await order.save();

    // Send notification to the new CP
    const notificationTitle = 'New Shoot Request';
    const notificationContent = `You have been assigned a Shoot request for "${order.order_name}". Please review and accept within 3 hours.`;

    sendNotification(nextCPId.toString(), notificationTitle, notificationContent, {
      type: 'newOrder',
      order_id: order._id.toString(),
      id: order._id.toString(),
      order_name: order.order_name,
    });

    await notificationService.insertNotification({
      modelName: 'newOrder',
      modelId: order._id,
      cpIds: [nextCPId],
      category: 'newOrder',
      message: notificationContent,
      metadata: {
        title: notificationTitle,
        type: 'newOrder',
        order_id: order._id.toString(),
        order_name: order.order_name,
      },
    });

    // Update the associated booking's salesRepId if order has a booking reference
    if (order.booking_ref) {
      try {
        const booking = await Booking.findById(order.booking_ref);
        if (booking) {
          booking.salesRepId = nextCPId;
          await booking.save();
          logger.info(`Order ${order._id}: Updated booking ${order.booking_ref} salesRepId to ${nextCPId}`);
        }
      } catch (error) {
        logger.error(`Order ${order._id}: Failed to update booking salesRepId:`, error);
        // Don't throw - continue with the reassignment even if booking update fails
      }
    }

    // Notify client about the reassignment
    if (order.client_id) {
      const clientNotificationTitle = 'Order Update';
      const clientNotificationContent = `Your order "${order.order_name}" has been reassigned to a new content provider.`;

      sendNotification(order.client_id.toString(), clientNotificationTitle, clientNotificationContent, {
        type: 'orderReassigned',
        order_id: order._id.toString(),
        order_name: order.order_name,
      });
    }

    logger.info(`Order ${order._id}: Successfully reassigned to CP ${nextCPId}`);
  } catch (error) {
    logger.error(`Error in reassignOrderToNextCP for order ${order._id}:`, error);
    throw error;
  }
};

/**
 * Automatically update order status based on shoot dates
 * This cron job runs every hour to update order statuses:
 * - pending → pre_production (when shoot is 1-7 days away)
 * - pre_production → production (on shoot day, when shoot starts)
 * - production → post_production (when shoot ends)
 */
const updateOrderStatusByShootDate = async () => {
  try {
    logger.info('Running cron job: updateOrderStatusByShootDate');

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find all orders that are not cancelled, disputed, or completed
    const activeOrders = await Order.find({
      order_status: { $nin: ['cancelled', 'in_dispute', 'completed'] },
      shoot_datetimes: { $exists: true, $ne: [] },
    });

    logger.info(`Found ${activeOrders.length} active orders to process`);

    let updatedCount = 0;

    for (const order of activeOrders) {
      try {
        // Skip if no shoot datetimes
        if (!order.shoot_datetimes || order.shoot_datetimes.length === 0) {
          continue;
        }

        // Get the earliest confirmed or pending shoot date
        const confirmedShoot = order.shoot_datetimes.find(
          (dt) => dt.date_status === 'confirmed' || dt.date_status === 'pending'
        );

        if (!confirmedShoot) {
          continue;
        }

        const shootStartTime = new Date(confirmedShoot.start_date_time);
        const shootEndTime = new Date(confirmedShoot.end_date_time);

        let newStatus = null;

        // Determine the appropriate status based on shoot dates
        if (now >= shootEndTime) {
          // Shoot has ended → post_production (if not already in post_production or later stages)
          if (['pending', 'pre_production', 'production'].includes(order.order_status)) {
            newStatus = 'post_production';
          }
        } else if (now >= shootStartTime && now < shootEndTime) {
          // Currently during shoot time → production
          if (['pending', 'pre_production'].includes(order.order_status)) {
            newStatus = 'production';
          }
        } else if (shootStartTime <= sevenDaysFromNow && shootStartTime > now) {
          // Shoot is within the next 7 days → pre_production
          if (order.order_status === 'pending') {
            newStatus = 'pre_production';
          }
        }

        // Update the order status if needed
        if (newStatus && newStatus !== order.order_status) {
          const oldStatus = order.order_status;
          order.order_status = newStatus;
          await order.save();

          logger.info(
            `Order ${order._id} (${order.order_name}): Status updated from "${oldStatus}" to "${newStatus}" based on shoot date ${shootStartTime.toISOString()}`
          );

          // Send notification to client about status change
          if (order.client_id) {
            const statusMessages = {
              pre_production: 'Your shoot is coming up soon! We are in the pre-production phase.',
              production: 'Your shoot is happening now!',
              post_production: 'Your shoot has been completed! We are now in post-production.',
            };

            const notificationContent =
              statusMessages[newStatus] || `Your order status has been updated to ${newStatus}.`;

            await notificationService.insertNotification({
              modelName: 'orderStatusUpdate',
              modelId: order._id,
              clientIds: [order.client_id],
              category: 'orderStatusUpdate',
              message: notificationContent,
              metadata: {
                title: 'Order Status Update',
                type: 'orderStatusUpdate',
                order_id: order._id.toString(),
                order_name: order.order_name,
                old_status: oldStatus,
                new_status: newStatus,
              },
            });
          }

          updatedCount++;
        }
      } catch (error) {
        logger.error(`Error updating order ${order._id}:`, error);
      }
    }

    logger.info(`Completed cron job: updateOrderStatusByShootDate. Updated ${updatedCount} orders.`);
  } catch (error) {
    logger.error('Error in updateOrderStatusByShootDate cron job:', error);
  }
};

module.exports = {
  checkAndReassignPendingOrders,
  reassignOrderToNextCP,
  updateOrderStatusByShootDate,
};
