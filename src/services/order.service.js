const httpStatus = require("http-status");
const { Order, CP, ChatRoom, User } = require("../models");
const Transaction = require("../models/transaction.model");
const ApiError = require("../utils/ApiError");
const getLastFiveChars = require("../utils/getLastFiveCharc");
const { sendNotification } = require("./fcm.service");
const {
  updateChatRoom,
  updateChatStatusByOrderStatus,
} = require("../services/chat.service");
const paymentService = require("./payment.service");
const cpService = require("./cp.service");
const mongoose = require("mongoose");
const gcpFileService = require("./gcpFile.service");
const notificationService = require('./notification.service');
const leadService = require('./lead.service');

/**
 * Generate a unique shoot ID
 * Starts with 3 digits (100-999), expands to 4 digits (1000-9999), then 5 digits, etc.
 * Checks existing shoot_ids to ensure uniqueness
 */
const generateUniqueShootId = async () => {
  let shootId;
  let isUnique = false;
  let currentDigits = 3; // Start with 3 digits
  const maxDigits = 6; // Max 6 digits (100000-999999)

  while (!isUnique && currentDigits <= maxDigits) {
    const min = Math.pow(10, currentDigits - 1); // 100, 1000, 10000, etc.
    const max = Math.pow(10, currentDigits) - 1; // 999, 9999, 99999, etc.
    let attempts = 0;
    const maxAttempts = 50; // Try 50 random numbers per digit range

    while (!isUnique && attempts < maxAttempts) {
      // Generate random number within current digit range
      shootId = String(Math.floor(min + Math.random() * (max - min + 1)));

      // Check if it already exists
      const existing = await Order.findOne({ shoot_id: shootId });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    // If not found in current digit range, move to next digit range
    if (!isUnique) {
      currentDigits++;
    }
  }

  // Ultimate fallback: use timestamp-based ID
  if (!isUnique) {
    shootId = String(Date.now()).slice(-6);
  }

  return shootId;
};

/**
 * Format client name for shoot naming convention
 * Converts "Lana Guzman" to "Lana_Guzman"
 */
const formatClientNameForShoot = (clientName) => {
  if (!clientName) return "Unknown";
  return clientName.replace(/\s+/g, '_');
};

/**
 * Generate order name in the format: ShootType_ClientName_ShootID
 * @param {string} clientName - The client's name
 * @param {string} shootId - The unique 3-digit shoot ID
 * @param {string} shootType - The shoot type (e.g., "Lifestyle", "Brand Campaign", "brand-campaign", etc.)
 */
const generateOrderName = (clientName, shootId, shootType = "Photography") => {
  const formattedName = formatClientNameForShoot(clientName);

  // Format shoot type: convert hyphens to spaces, then to title case, then replace spaces with underscores
  // This handles both "brand-campaign" and "Brand Campaign" formats
  let formattedShootType = shootType
    .replace(/-/g, ' ') // Convert hyphens to spaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title case each word
    .join('_'); // Join with underscores

  return `${formattedShootType}_${formattedName}_${shootId}`;
};

/**
 * Migrate existing order to new naming convention if needed
 * Generates shoot_id and order_name if they don't exist or use old format
 */
const migrateOrderNaming = async (order) => {
  if (!order) return order;

  // If order already has shoot_id and proper order_name format, skip migration
  if (order.shoot_id && order.order_name && !order.order_name.startsWith('Order for ') && !order.order_name.startsWith('Order ')) {
    return order;
  }

  try {
    // Generate shoot_id if missing
    let shootId = order.shoot_id;
    if (!shootId) {
      shootId = await generateUniqueShootId();
    }

    // Get client name for naming convention
    let clientName = "Unknown";
    if (order.client_id) {
      if (typeof order.client_id === 'object' && order.client_id.name) {
        clientName = order.client_id.name;
      } else {
        // Need to fetch client info
        const client = await User.findById(order.client_id).select('name');
        if (client?.name) {
          clientName = client.name;
        }
      }
    }

    // Get shoot type for naming convention
    // Priority: shoot_type > content_vertical > service_type (service_type often contains "shoot-edit" instead of actual type)
    const shootType = order.shoot_type || order.content_vertical || order.service_type || "Photography";

    const orderName = generateOrderName(clientName, shootId, shootType);

    // Update the order in database and return the updated document
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      { shoot_id: shootId, order_name: orderName },
      { new: true }
    ).populate('client_id', 'name profile_picture email');

    // Return the updated order or the original if update failed
    return updatedOrder || order;
  } catch (error) {
    console.error('Error migrating order naming:', error.message);
    return order;
  }
};

const createOrder = async (orderBody) => {
  // Generate unique shoot_id if not provided
  if (!orderBody.shoot_id) {
    orderBody.shoot_id = await generateUniqueShootId();
  }

  // Generate order_name in ShootType_ClientName_ShootID format if not provided or if using old format
  if (!orderBody.order_name || orderBody.order_name.startsWith('Order for ') || orderBody.order_name.startsWith('Order ')) {
    let clientName = "Unknown";

    // Try to get client name from orderBody or fetch from database
    if (orderBody.client_name) {
      clientName = orderBody.client_name;
    } else if (orderBody.client_id) {
      const client = await User.findById(orderBody.client_id).select('name');
      if (client?.name) {
        clientName = client.name;
      }
    }

    // Get shoot type for naming convention
    // Priority: shoot_type > content_vertical > service_type (service_type often contains "shoot-edit" instead of actual type)
    const shootType = orderBody.shoot_type || orderBody.content_vertical || orderBody.service_type || "Photography";

    orderBody.order_name = generateOrderName(clientName, orderBody.shoot_id, shootType);
  }

  // Create a new order with the orderBody
  const order = await Order.create(orderBody);

  // NOTE: Chat room is NOT auto-created on order creation.
  // Admin must explicitly start chat via the Messages tab in Shoot Details.
  // This allows admin to select participants before starting the conversation.

  // Send order create notification to the cps
  if (Array.isArray(order.cp_ids) && order.cp_ids.length > 0) {
    // Iterate over each CP ID object in the array
    for (const cp of order.cp_ids) {
      // Extract CP ID from the current object
      const cpId = cp.id.toString();
      // Prepare notification title and content
      const notificationTitle = "New Shoot Request";
      const notificationContent =
        "You have received a new Shoot request. Feel free to review it and accept when you are ready";

      // Send FCM push notification to the CP's device
      sendNotification(cpId, notificationTitle, notificationContent, {
        type: "newOrder",
        order_id: order.id,
        id: order.id,
        order_name: order.order_name,
      });

      // Create notification record in database for in-app notification center
      await notificationService.insertNotification({
        modelName: 'newOrder',
        modelId: order._id,
        cpIds: [cp.id],
        category: 'newOrder',
        message: notificationContent,
        metadata: {
          title: notificationTitle,
          type: 'newOrder',
          order_id: order.id,
          order_name: order.order_name,
        }
      });
    }
  }

  // const orderAmount = orderBody.shoot_cost;
  const orderAmount = orderBody.shoot_cost || 1 * 100;
  const currency = "USD";
  const description = orderBody.order_name;

  // const paymentData = await paymentService.createPaymentIntent({
  //   amount: orderAmount,
  //   currency: currency,
  //   description: description,
  //   metadata: {
  //     order_id: order.id,
  //   },
  // });

  // Save the order
  // ==================================
  // Create Folder in gcp bucket based on this order
  // Folder naming format: "{ShootType}_{ClientName}_{ShootID}"
  // Example: "Lifestyle_Plabon_123"

  // Get shoot name (actual shoot type, not service_type which is "shoot-raw"/"shoot-edit")
  const shootName = (order?.shoot_type || order?.content_vertical || order?.service_type || "Photography")
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('_');

  // Get client name for folder naming
  let clientName = "Unknown";
  if (order?.client_id) {
    try {
      const userService = require("./user.service");
      const client = await userService.getUserById(order.client_id);
      if (client && client.name) {
        // Use first name only for cleaner folder names
        clientName = client.name.split(' ')[0];
      }
    } catch (error) {
      console.error("Error fetching client name for folder:", error.message);
    }
  }

  // Get shoot ID
  const shootId = order?.shoot_id || getLastFiveChars(order?.id);

  // Create folder path: "{ShootName}_{ClientName}_{ShootID}"
  let file_path = `${shootName}_${clientName}_${shootId}`;

  // Store the folder path in order for reference
  order.file_path = {
    status: false,
    dir_name: file_path
  };

  await gcpFileService.createFolder(
    file_path,
    order?.cp_ids,
    order?.id,
    order?.client_id // client_id
  );
  await gcpFileService.createChatFolder(
    file_path,
    order?.cp_ids,
    order?.id,
    order?.client_id // client_id
  );
  // ==================================

  await order.save();

  return order;
};

const queryOrders = async (filter, options) => {
  const orders = await Order.paginate(filter, options);
  return orders;
};

// const getOrderById = async (id, cid) => {
//   console.log("id", id);
//   console.log("cid", cid);
//   return Order.findById(id).populate("client_id");
// };

const getOrderById = async (id, cid) => {
  let order;
  if (cid === undefined) {
    order = await Order.findById(id).populate("client_id");
  } else {
    order = await Order.findById(id).populate("client_id").populate("cp_ids.id");
  }

  // Auto-migrate order naming to new convention if needed
  if (order) {
    order = await migrateOrderNaming(order);
  }

  return order;
};

// const getOrderById = async (id) => {
//   return Order.findById(id).populate({
//     path: 'cp_ids.id',
//     select: 'name email role id isEmailVerified'
//   });
// };

const getOrderByUserId = async (userId) => {
  const order = Order.find().or([{ cp_ids: userId }, { client_id: userId }]);
  return order;
};

// New Order update function with multiple assigned cp
// updatedBy: { userId, role } - the user who made the update (to exclude from notifications)
const updateOrderById = async (orderId, updateBody, updatedBy = null) => {
  try {
    // Fetch and check order
    const order = await getOrderById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Update order properties
    if (Object.keys(updateBody).length > 0) {
      // Handle cp_ids separately first since it requires async operations
      if (updateBody.cp_ids && Array.isArray(updateBody.cp_ids)) {
        // Import transaction service
        const transactionService = require("./transaction.service");

        // Process each CP update sequentially to handle async operations properly
        for (const updatedCp of updateBody.cp_ids) {
          // Check if the CP already exists in the order
          // Support both User's ObjectId (cp.id) and subdocument's _id (cp._id) for flexibility
          const existingCpIndex = order.cp_ids.findIndex(
            (cp) => cp.id.toString() === updatedCp.id || cp._id.toString() === updatedCp.id
          );
          if (existingCpIndex !== -1) {
            // Store the previous decision to check if it's changing to "accepted"
            const previousDecision = order.cp_ids[existingCpIndex].decision;
            // If CP exists, update its decision
            order.cp_ids[existingCpIndex].decision = updatedCp.decision;

            // Create transaction when CP accepts the order (decision changes to "accepted")
            if (updatedCp.decision === "accepted" && previousDecision !== "accepted") {
              try {
                // Check if transaction already exists to prevent duplicates
                const existingTransaction = await Transaction.findOne({
                  orderId: order._id,
                  userId: updatedCp.id,
                  type: "earning",
                });

                if (!existingTransaction) {
                  // Calculate earnings amount - divide by total number of CPs assigned to the order
                  // This matches the logic in updateAmountToCpsProfile
                  const earningsAmount = order.shoot_cost / order.cp_ids.length;

                  // Create earning transaction when CP accepts order
                  await transactionService.createEarningTransaction(
                    order._id,
                    updatedCp.id,
                    earningsAmount
                  );

                  // Update CP's balance immediately when accepting order
                  const cp = await CP.findOne({ userId: updatedCp.id });
                  if (cp) {
                    cp.totalEarnings += earningsAmount;
                    cp.currentBalance += earningsAmount;
                    await cp.save();
                  }
                }
              } catch (error) {
                // Log error but don't fail the order update
                console.error(
                  `Failed to create transaction for CP ${updatedCp.id} accepting order ${order.id}:`,
                  error.message
                );
              }

              // Add CP to GCP folder metadata to give access to the order folder
              try {
                console.log('🔑 CP ACCEPTED ORDER - Adding CP to folder metadata:', {
                  cpId: updatedCp.id,
                  orderId: order.id,
                  orderName: order.order_name,
                  orderFilePath: order.file_path
                });
                await gcpFileService.updateGcpFolderMetadata(
                  order.order_name,
                  updatedCp.id,
                  order.id
                );
                console.log('✅ Successfully updated folder metadata for CP:', updatedCp.id);
              } catch (error) {
                // Log error but don't fail the order update
                console.error(
                  `Failed to update GCP folder metadata for CP ${updatedCp.id} accepting order ${order.id}:`,
                  error.message
                );
              }

              // Send notification to CLIENT when CP accepts the order
              if (order.client_id) {
                const acceptNotificationTitle = "Shoot Request Accepted";
                const acceptNotificationContent = `A Creative Partner has accepted your shoot request '${order.order_name}'. Your shoot is being scheduled.`;

                // Extract actual client ID (handle both populated and non-populated cases)
                const clientIdForNotification = (order.client_id?._id || order.client_id)?.toString();

                // Send FCM push notification to client
                sendNotification(clientIdForNotification, acceptNotificationTitle, acceptNotificationContent, {
                  type: "orderAccepted",
                  order_id: order.id,
                  id: order.id,
                  order_name: order.order_name,
                });

                // Create in-app notification for client
                await notificationService.insertNotification({
                  modelName: 'orderAccepted',
                  modelId: order._id,
                  clientId: order.client_id,
                  category: 'Order',
                  message: acceptNotificationContent,
                  metadata: {
                    title: acceptNotificationTitle,
                    type: 'orderAccepted',
                    order_id: order.id,
                    order_name: order.order_name,
                    cpId: updatedCp.id,
                  }
                });
              }
            }

            // Handle CP rejection - notify client
            if (updatedCp.decision === "rejected" && previousDecision !== "rejected") {
              if (order.client_id) {
                const rejectNotificationTitle = "Shoot Request Update";
                const rejectNotificationContent = `A Creative Partner has declined the shoot request '${order.order_name}'. We are finding another partner for you.`;

                // Extract actual client ID (handle both populated and non-populated cases)
                const clientIdForRejectNotification = (order.client_id?._id || order.client_id)?.toString();

                // Send FCM push notification to client
                sendNotification(clientIdForRejectNotification, rejectNotificationTitle, rejectNotificationContent, {
                  type: "orderRejected",
                  order_id: order.id,
                  id: order.id,
                  order_name: order.order_name,
                });

                // Create in-app notification for client
                await notificationService.insertNotification({
                  modelName: 'orderRejected',
                  modelId: order._id,
                  clientId: order.client_id,
                  category: 'Order',
                  message: rejectNotificationContent,
                  metadata: {
                    title: rejectNotificationTitle,
                    type: 'orderRejected',
                    order_id: order.id,
                    order_name: order.order_name,
                  }
                });
              }
            }

            // Remove cp from gcp metadata if cp cancelled the order
            if (updatedCp.decision === "cancelled") {
              await gcpFileService.removeCpFromMetadata(
                order.order_name,
                updatedCp.id,
                order.id
              );

              // Notify client about CP cancellation
              if (order.client_id) {
                const cancelNotificationTitle = "Shoot Assignment Cancelled";
                const cancelNotificationContent = `A Creative Partner has cancelled their assignment for shoot '${order.order_name}'.`;

                // Extract actual client ID (handle both populated and non-populated cases)
                const clientIdForCancelNotification = (order.client_id?._id || order.client_id)?.toString();

                sendNotification(clientIdForCancelNotification, cancelNotificationTitle, cancelNotificationContent, {
                  type: "cpCancelled",
                  order_id: order.id,
                  id: order.id,
                  order_name: order.order_name,
                });

                await notificationService.insertNotification({
                  modelName: 'cpCancelled',
                  modelId: order._id,
                  clientId: order.client_id,
                  category: 'Order',
                  message: cancelNotificationContent,
                  metadata: {
                    title: cancelNotificationTitle,
                    type: 'cpCancelled',
                    order_id: order.id,
                    order_name: order.order_name,
                  }
                });
              }
            }
          } else {
            // If CP doesn't exist, add it to the cp_ids array
            const notificationTitle = "New Shoot Request";
            const notificationContent =
              "You have received a new Shoot request. Feel free to review it and accept when you are ready";
            // Send notification to the CP
            const cpId = updatedCp.id.toString();
            sendNotification(cpId, notificationTitle, notificationContent, {
              type: "newOrder",
              order_id: order.id,
              id: order.id,
              order_name: order.order_name,
            });

            // Create in-app notification for the new CP
            await notificationService.insertNotification({
              modelName: 'newOrder',
              modelId: order._id,
              cpIds: [updatedCp.id],
              category: 'Order',
              message: notificationContent,
              metadata: {
                title: notificationTitle,
                type: 'newOrder',
                order_id: order.id,
                order_name: order.order_name,
              }
            });

            order.cp_ids.push({
              id: updatedCp.id,
              decision: updatedCp.decision,
              assignedAt: new Date(),
            });

            // Create transaction if new CP is added with "accepted" decision
            if (updatedCp.decision === "accepted") {
              try {
                // Check if transaction already exists to prevent duplicates
                const existingTransaction = await Transaction.findOne({
                  orderId: order._id,
                  userId: updatedCp.id,
                  type: "earning",
                });

                if (!existingTransaction) {
                  // Calculate earnings amount - divide by total number of CPs assigned to the order
                  // This matches the logic in updateAmountToCpsProfile
                  const earningsAmount = order.shoot_cost / order.cp_ids.length;

                  // Create earning transaction when CP accepts order
                  await transactionService.createEarningTransaction(
                    order._id,
                    updatedCp.id,
                    earningsAmount
                  );

                  // Update CP's balance immediately when accepting order
                  const cp = await CP.findOne({ userId: updatedCp.id });
                  if (cp) {
                    cp.totalEarnings += earningsAmount;
                    cp.currentBalance += earningsAmount;
                    await cp.save();
                  }
                }
              } catch (error) {
                // Log error but don't fail the order update
                console.error(
                  `Failed to create transaction for CP ${updatedCp.id} accepting order ${order.id}:`,
                  error.message
                );
              }

              // Add CP to GCP folder metadata to give access to the order folder
              try {
                console.log('🔑 CP ACCEPTED ORDER - Adding CP to folder metadata:', {
                  cpId: updatedCp.id,
                  orderId: order.id,
                  orderName: order.order_name,
                  orderFilePath: order.file_path
                });
                await gcpFileService.updateGcpFolderMetadata(
                  order.order_name,
                  updatedCp.id,
                  order.id
                );
                console.log('✅ Successfully updated folder metadata for CP:', updatedCp.id);
              } catch (error) {
                // Log error but don't fail the order update
                console.error(
                  `Failed to update GCP folder metadata for CP ${updatedCp.id} accepting order ${order.id}:`,
                  error.message
                );
              }

              // Notify client about new CP accepting
              if (order.client_id) {
                const acceptNotificationTitle = "Shoot Request Accepted";
                const acceptNotificationContent = `A Creative Partner has accepted your shoot request '${order.order_name}'. Your shoot is being scheduled.`;

                // Extract actual client ID (handle both populated and non-populated cases)
                const clientIdForAcceptNotification = (order.client_id?._id || order.client_id)?.toString();

                sendNotification(clientIdForAcceptNotification, acceptNotificationTitle, acceptNotificationContent, {
                  type: "orderAccepted",
                  order_id: order.id,
                  id: order.id,
                  order_name: order.order_name,
                });

                await notificationService.insertNotification({
                  modelName: 'orderAccepted',
                  modelId: order._id,
                  clientId: order.client_id,
                  category: 'Order',
                  message: acceptNotificationContent,
                  metadata: {
                    title: acceptNotificationTitle,
                    type: 'orderAccepted',
                    order_id: order.id,
                    order_name: order.order_name,
                    cpId: updatedCp.id,
                  }
                });
              }
            }

            // add cp_ids in gcp metadata for accessing the file for this order
            console.log('🔑 NEW CP ADDED TO ORDER - Adding CP to folder metadata:', {
              cpId: updatedCp.id,
              orderId: order.id,
              orderName: order.order_name,
              orderFilePath: order.file_path
            });
            await gcpFileService.updateGcpFolderMetadata(
              order.order_name,
              updatedCp.id,
              order.id
            );
            console.log('✅ Successfully updated folder metadata for new CP:', updatedCp.id);
          }
        }

        // Mark cp_ids as modified to ensure Mongoose saves the changes
        // This is necessary because Mongoose may not detect changes to nested array subdocuments
        order.markModified('cp_ids');
      }
      
      // Send order status update notification (before updating the status)
      // Only notify users who didn't make the change
      if (
        "order_status" in updateBody &&
        updateBody.order_status !== order.order_status
      ) {
        const notificationTitle = "Shoot Status Update";
        const NotificationContent = `The status of Shoot '${order.order_name}' has transitioned from ${order.order_status} to ${updateBody.order_status}`;
        const notificationData = {
          type: "orderStatusUpdate",
          order_id: order.id,
          id: order.id,
          order_name: order.order_name,
        };

        // Extract actual client ID (handle both populated and non-populated cases)
        const clientIdStr = (order.client_id?._id || order.client_id)?.toString();

        // Check if the updater is the client
        const isClientUpdating = updatedBy &&
          order.client_id &&
          updatedBy.userId?.toString() === clientIdStr;

        // Send notification to the client (only if client didn't make the change)
        if (order.client_id && !isClientUpdating) {
          sendNotification(
            clientIdStr,
            notificationTitle,
            NotificationContent,
            notificationData
          );

          // Create in-app notification for client
          await notificationService.insertNotification({
            modelName: 'orderStatusUpdate',
            modelId: order._id,
            clientId: order.client_id,
            category: 'Order',
            message: NotificationContent,
            metadata: {
              title: notificationTitle,
              type: 'orderStatusUpdate',
              order_id: order.id,
              order_name: order.order_name,
              previousStatus: order.order_status,
              newStatus: updateBody.order_status,
            }
          });
        }

        // Send notification to CPs (excluding the CP who made the change)
        const cpIdsForNotification = [];
        order.cp_ids?.forEach((cp) => {
          const cpId = cp.id.toString();
          // Skip if this CP is the one who made the update
          const isCpUpdating = updatedBy && updatedBy.userId?.toString() === cpId;
          if (!isCpUpdating) {
            cpIdsForNotification.push(cp.id);
            sendNotification(
              cpId,
              notificationTitle,
              NotificationContent,
              notificationData
            );
          }
        });

        // Create in-app notification for CPs (excluding the one who made the change)
        if (cpIdsForNotification.length > 0) {
          await notificationService.insertNotification({
            modelName: 'orderStatusUpdate',
            modelId: order._id,
            cpIds: cpIdsForNotification,
            category: 'Order',
            message: NotificationContent,
            metadata: {
              title: notificationTitle,
              type: 'orderStatusUpdate',
              order_id: order.id,
              order_name: order.order_name,
              previousStatus: order.order_status,
              newStatus: updateBody.order_status,
            }
          });
        }
      }

      // Handle CP earnings update for both paid and partially_paid orders
      if (order.payment.payment_status === "paid" || order.payment.payment_status === "partially_paid") {
        if (
          updateBody.order_status === "completed" &&
          order.order_status !== "completed"
        ) {
          updateCpsEarnings(order, true); // Pass true to indicate adding earnings
        } else if (
          order.order_status === "completed" &&
          updateBody.order_status !== "completed"
        ) {
          updateCpsEarnings(order, false); // Pass false to indicate subtracting earnings
        }
      }

      // Handle other update properties (non-async operations)
      Object.keys(updateBody).forEach((key) => {
        if (key === "payment") {
          // Handle payment object
          order.payment = { ...order.payment, ...updateBody.payment };
        } else if (key === "payment_ids") {
          // Handle nested property
          order.payment.payment_ids = updateBody.payment_ids;
        } else if (key === "cp_ids") {
          // cp_ids already handled above, skip here
        } else {
          // For other properties, assign directly
          order[key] = updateBody[key];
        }
      });
    }
    // Update cp's ratings
    if (
      updateBody.order_status === "completed" ||
      updateBody.order_status === "cancelled"
    ) {
      try {
        await updateCpRates(order.cp_ids);
      } catch (error) {
        // Log the error but don't fail the entire order update
        console.error(`Failed to update CP rates for order ${order.id}:`, error.message);
      }

      // Per PRD: Update chat room status when shoot lifecycle changes
      // Cancelled shoots -> chat becomes read_only
      // Completed/Archived shoots -> chat becomes archived
      try {
        await updateChatStatusByOrderStatus(order.id, updateBody.order_status);
      } catch (error) {
        console.error(`Failed to update chat status for order ${order.id}:`, error.message);
      }
    }

    // NOTE: CPs are NOT automatically added to chat when order cp_ids are updated
    // Per PRD: Only admin can manually add CPs to chat via "Add Participants" feature
    // The updateChatRoomWithCpIds call has been removed intentionally
    
    // Update the order record
    await order.save();
    
    return order;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID");
    }
    throw error;
  }
};

//
const updateCpsEarnings = async (order, updateBody) => {
  // Check if the order status changes to "completed" from something else
  if (updateBody) {
    await updateAmountToCpsProfile(order, true);
  } else {
    await updateAmountToCpsProfile(order, false);
  }
};

const updateAmountToCpsProfile = async (order, addEarnings) => {
  try {
    const acceptedCP = order.cp_ids.find((cp) => cp.decision === "accepted");

    if (!acceptedCP) {
      return;
    }

    // Retrieve the CP's ID
    const cpId = acceptedCP.id;

    // Assuming CP from db
    const cp = await CP.findOne({ userId: cpId });

    if (!cp) {
      throw new Error("CP not found");
    }

    // Calculate earnings based on payment status and type
    let earningsAmount = 0;

    if (order.payment.payment_status === "paid") {
      // For fully paid orders, use the full shoot cost
      earningsAmount = order.shoot_cost / order.cp_ids.length;
    } else if (order.payment.payment_status === "partially_paid") {
      // For partially paid orders, use only the amount that has been paid
      earningsAmount = order.payment.amount_paid / order.cp_ids.length;
    }

    if (addEarnings) {
      // Add earnings if addEarnings is true
      cp.totalEarnings += earningsAmount;
      cp.currentBalance += earningsAmount;

      // Create transaction record for earning
      const transactionService = require("./transaction.service");
      await transactionService.createEarningTransaction(
        order._id,
        cpId,
        earningsAmount
      );
    } else {
      // Subtract earnings if addEarnings is false
      cp.totalEarnings -= earningsAmount;
      cp.currentBalance -= earningsAmount;

      // Ensure balances don't go negative
      cp.totalEarnings = Math.max(0, cp.totalEarnings);
      cp.currentBalance = Math.max(0, cp.currentBalance);
    }

    // Save the updated CP document
    await cp.save();

    return cp; // Returning the updated CP document
  } catch (error) {
    throw error;
  }
};
// Cp's ratings update in cp's profile when a order is completed
const updateCpRates = async (cps) => {
  if (Array.isArray(cps)) {
    try {
      // Create an array of promises
      const updatePromises = cps.map(async (user) => {
        const cp = await CP.findOne({ userId: user.id });
        if (cp) {
          const rates = await cpService.calculateCpRates(user.id);
          cp.set({ rates });
          await cp.save();
        } else {
          console.error(
            `CP not found for updating rates userId =>: ${user.id}`
          );
        }
      });
      // Wait for all promises to resolve
      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Error updating CP rates:", error);
    }
  }
};

const deleteOrderById = async (orderId) => {
  const order = await getOrderById(orderId);
  await gcpFileService.deleteFile(`${order.order_name}/`);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }
  await order.deleteOne();
  return order;
};

const removeMeetingFromOrder = async (meetingId) => {
  try {
    // Remove the meeting from the order using findOneAndUpdate
    return await Order.findOneAndUpdate(
      { meeting_date_times: meetingId },
      { $pull: { meeting_date_times: meetingId } },
      { new: true }
    );
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      // Throw an ApiError for invalid meeting ID
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID");
    }
    // Throw an ApiError for internal server error
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const checkOrderId = async (order_id, required = false) => {
  if (typeof order_id !== "undefined") {
    if (order_id === "") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Order ID cannot be empty");
    }

    let order = await Order.findById(order_id);

    if (!order) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID provided");
    }

    return order;
  }

  if (required && !order_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Order ID is required");
  }
};

// get busy area and polygons
const getBusyArea = async (myLocation) => {
  const { latitude, longitude } = JSON.parse(myLocation);

  try {
    const orders = await Order.find({
      geo_location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          $maxDistance: 300000, // 200 km in meters
        },
      },
    });
    // Cluster orders that are close to each other
    const clusters = clusterOrders(orders);

    // Create polygons from clusters
    const polygons = createPolygons(clusters);
    return polygons;
  } catch (error) {
    console.error("Error in getBusyArea:", error);
    // res.status(500).json({ error: "Internal server error" });
  }
};

// Function to cluster nearby orders
function clusterOrders(orders, maxDistance = 5000) {
  // 5 km clustering distance
  const clusters = [];
  const processed = new Set();

  orders.forEach((order, index) => {
    if (processed.has(index)) return;

    const cluster = [order];
    processed.add(index);

    orders.forEach((otherOrder, otherIndex) => {
      if (index !== otherIndex && !processed.has(otherIndex)) {
        const distance = calculateDistance(
          order.geo_location.coordinates,
          otherOrder.geo_location.coordinates
        );
        if (distance <= maxDistance) {
          cluster.push(otherOrder);
          processed.add(otherIndex);
        }
      }
    });

    clusters.push(cluster);
  });

  return clusters;
}

// Function to calculate distance between two points (in meters)
function calculateDistance(coord1, coord2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (coord1[1] * Math.PI) / 180;
  const φ2 = (coord2[1] * Math.PI) / 180;
  const Δφ = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const Δλ = ((coord2[0] - coord1[0]) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Function to create a polygon with a similar shape to the provided ones
function createIrregularPolygon(center, size) {
  const { latitude, longitude } = center;
  const offset = 15 / 1000; // Size in km

  return [
    {
      latitude: latitude + offset,
      longitude: longitude - offset,
    },
    {
      latitude: latitude + offset,
      longitude: longitude + offset,
    },
    {
      latitude: latitude - offset,
      longitude: longitude + offset,
    },
    {
      latitude: latitude - offset,
      longitude: longitude - offset,
    },
  ];
}

// Function to create polygons for clusters
function createPolygons(clusters) {
  return clusters.map((cluster, index) => {
    const center = calculateCentroid(cluster);
    return {
      id: `polygon_${index}`,
      coordinates: createIrregularPolygon(center, cluster.length),
      busyness: determineBusyness(cluster.length),
      centroid: center,
    };
  });
}

// Function to calculate the centroid of a cluster
function calculateCentroid(cluster) {
  const len = cluster.length;
  let x = 0;
  let y = 0;
  cluster.forEach((order) => {
    x += order.geo_location.coordinates[1];
    y += order.geo_location.coordinates[0];
  });
  return { latitude: x / len, longitude: y / len };
}

// Function to determine busyness level
function determineBusyness(orderCount) {
  if (orderCount < 5) return "Low";
  if (orderCount < 10) return "Busy";
  return "Very Busy";
}

/**
 * Update order with file URLs and platform links
 * @param {string} orderId - The order ID
 * @param {Array} fileUrls - Array of file URLs
 * @param {Array} platformLinks - Array of platform links with platform and URL
 * @returns {Promise<Order>} - Updated order
 */
const updateOrderMediaLinks = async (orderId, fileUrls = [], platformLinks = []) => {
  const order = await getOrderById(orderId);
  
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }
  
  // Validate maximum number of files
  if (fileUrls && fileUrls.length > 0) {
    const totalFiles = (order.fileUrls || []).length + fileUrls.length;
    if (totalFiles > 5) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Maximum 5 files allowed per order');
    }
    
    // Add new file URLs to the existing array
    order.fileUrls = [...(order.fileUrls || []), ...fileUrls];
  }
  
  // Validate and add platform links
  if (platformLinks && platformLinks.length > 0) {
    // Add new platform links to the existing array
    order.platformLinks = [...(order.platformLinks || []), ...platformLinks];
  }
  
  // Save the updated order
  await order.save();
  
  return order;
};

/**
 * Generate HTML invoice for an order
 * @param {Object} order - Order object
 * @returns {Promise<string>} - HTML invoice content
 */
const generateInvoiceHtml = async (order) => {
  try {
    // Populate client and service provider details
    const populatedOrder = await Order.findById(order._id)
      .populate('client_id', 'name email contact_number location')
      .populate('cp_ids.id', 'name email contact_number');

    if (!populatedOrder) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    // Format invoice number
    const invoiceNumber = `#INV-${populatedOrder._id.toString().slice(-8)}`;
    
    // Format date
    const date = new Date(populatedOrder.createdAt).toLocaleDateString();
    
    // Get payment details
    let paymentStatus = 'Pending';
    let amountPaid = 0;
    let amountRemaining = populatedOrder.shoot_cost || 0;
    
    if (populatedOrder.payment) {
      if (populatedOrder.payment.payment_status === 'paid') {
        paymentStatus = 'Paid';
        amountPaid = populatedOrder.payment.amount_paid || 0;
        amountRemaining = populatedOrder.payment.amount_remaining || 0;
      } else if (populatedOrder.payment.payment_status === 'partially_paid') {
        paymentStatus = 'Partially Paid';
        amountPaid = populatedOrder.payment.amount_paid || 0;
        amountRemaining = populatedOrder.payment.amount_remaining || 0;
      }
    }
    
    // Get service provider names
    const serviceProviders = populatedOrder.cp_ids.map(cp => {
      const provider = cp.id;
      return provider ? provider.name : 'N/A';
    }).join(', ');
    
    // Create a professional HTML invoice
    const invoiceHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice ${invoiceNumber}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            background-color: #f9f9f9;
          }
          .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 30px;
            background-color: #fff;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
          }
          .invoice-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            align-items: center;
          }
          .invoice-branding {
            display: flex;
            flex-direction: column;
          }
          .logo-placeholder {
            width: 80px;
            height: 80px;
            background-color: #f0f0f0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: #555;
            margin-bottom: 10px;
          }
          .invoice-title {
            font-size: 32px;
            font-weight: 700;
            color: #2c3e50;
            letter-spacing: 1px;
          }
          .invoice-number {
            font-size: 16px;
            color: #7f8c8d;
            margin-top: 5px;
          }
          .company-details {
            text-align: right;
          }
          .company-details h2 {
            margin: 0 0 5px;
            color: #2c3e50;
          }
          .company-details p {
            margin: 0;
            color: #7f8c8d;
            line-height: 1.5;
          }
          .invoice-meta {
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
          }
          .meta-item {
            flex: 1;
          }
          .meta-label {
            font-size: 12px;
            text-transform: uppercase;
            color: #95a5a6;
            margin-bottom: 5px;
          }
          .meta-value {
            font-size: 16px;
            font-weight: 600;
            color: #2c3e50;
          }
          .invoice-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          .client-details, .order-details {
            flex-basis: 48%;
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
          }
          .detail-row {
            margin-bottom: 10px;
            display: flex;
          }
          .detail-label {
            font-weight: 600;
            color: #7f8c8d;
            width: 140px;
          }
          .detail-value {
            color: #2c3e50;
            flex: 1;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border-radius: 6px;
            overflow: hidden;
          }
          .invoice-table th {
            background-color: #2c3e50;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
          }
          .invoice-table td {
            padding: 15px;
            border-bottom: 1px solid #e0e0e0;
          }
          .invoice-table tr:nth-child(even) {
            background-color: #f8f9fa;
          }
          .invoice-table tr:last-child td {
            border-bottom: none;
          }
          .invoice-summary {
            margin-top: 30px;
            margin-left: auto;
            width: 350px;
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-row.total {
            font-weight: 700;
            font-size: 18px;
            color: #2c3e50;
            border-top: 2px solid #2c3e50;
            padding-top: 15px;
            margin-top: 10px;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .status-paid {
            background-color: #27ae60;
            color: white;
          }
          .status-partial {
            background-color: #f39c12;
            color: white;
          }
          .status-pending {
            background-color: #e74c3c;
            color: white;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #7f8c8d;
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
            padding-top: 20px;
          }
          .footer p {
            margin: 5px 0;
          }
          .thank-you {
            font-size: 24px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 10px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <div class="invoice-branding">
              <div class="logo-placeholder">BEIGE</div>
              <div class="invoice-title">INVOICE</div>
              <div class="invoice-number">${invoiceNumber}</div>
            </div>
            <div class="company-details">
              <h2>Beige Corporation</h2>
              <p>
                123 Photography Lane<br>
                San Francisco, CA 94107<br>
                United States<br>
                contact@beigecorp.com
              </p>
            </div>
          </div>
          
          <div class="invoice-meta">
            <div class="meta-item">
              <div class="meta-label">Date Issued</div>
              <div class="meta-value">${date}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Status</div>
              <div class="meta-value">
                <span class="status-badge ${paymentStatus === 'Paid' ? 'status-paid' : paymentStatus === 'Partially Paid' ? 'status-partial' : 'status-pending'}">
                  ${paymentStatus}
                </span>
              </div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Order ID</div>
              <div class="meta-value">${populatedOrder._id.toString().slice(-6)}</div>
            </div>
          </div>
          
          <div class="invoice-details">
            <div class="client-details">
              <div class="section-title">Client Information</div>
              <div class="detail-row">
                <div class="detail-label">Name:</div>
                <div class="detail-value">${populatedOrder.client_id ? populatedOrder.client_id.name : 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Email:</div>
                <div class="detail-value">${populatedOrder.client_id ? populatedOrder.client_id.email : 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Contact:</div>
                <div class="detail-value">${populatedOrder.client_id && populatedOrder.client_id.contact_number ? populatedOrder.client_id.contact_number : 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Location:</div>
                <div class="detail-value">${populatedOrder.client_id && populatedOrder.client_id.location ? populatedOrder.client_id.location : 'N/A'}</div>
              </div>
            </div>
            
            <div class="order-details">
              <div class="section-title">Order Details</div>
              <div class="detail-row">
                <div class="detail-label">Order Name:</div>
                <div class="detail-value">${populatedOrder.order_name || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Order Status:</div>
                <div class="detail-value">${populatedOrder.order_status || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Service Type:</div>
                <div class="detail-value">${populatedOrder.service_type || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Provider(s):</div>
                <div class="detail-value">${serviceProviders}</div>
              </div>
            </div>
          </div>
          
          <table class="invoice-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Service Provider(s)</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${populatedOrder.service_type || 'Photography Services'} - ${populatedOrder.order_name || 'Photography Session'}</td>
                <td>${serviceProviders}</td>
                <td>$${(populatedOrder.shoot_cost || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="invoice-summary">
            <div class="summary-row">
              <div>Subtotal:</div>
              <div>$${(populatedOrder.shoot_cost || 0).toFixed(2)}</div>
            </div>
            <div class="summary-row">
              <div>Total Paid:</div>
              <div>$${amountPaid.toFixed(2)}</div>
            </div>
            <div class="summary-row total">
              <div>Amount Due:</div>
              <div>$${amountRemaining.toFixed(2)}</div>
            </div>
          </div>
          
          <div class="thank-you">Thank You For Your Business!</div>
          
          <div class="footer">
            <p>If you have any questions regarding this invoice, please contact our support team.</p>
            <p>&copy; ${new Date().getFullYear()} Beige Corporation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    return invoiceHtml;
  } catch (error) {
    console.error('Error generating invoice HTML:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to generate invoice: ${error.message}`);
  }
};

/**
 * Generate a professional PDF invoice for an order
 * @param {Object} order - Order object
 * @returns {Promise<Buffer>} - PDF buffer
 */
const generateProfessionalInvoicePDF = async (order) => {
  try {
    // Populate client and service provider details
    const populatedOrder = await Order.findById(order._id)
      .populate('client_id', 'name email contact_number location')
      .populate('cp_ids.id', 'name email contact_number');

    if (!populatedOrder) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }

    // Format invoice number
    const invoiceNumber = `#INV-${populatedOrder._id.toString().slice(-8)}`;
    
    // Format date
    const date = new Date(populatedOrder.createdAt).toLocaleDateString();
    
    // Get payment details
    let paymentStatus = 'Pending';
    let amountPaid = 0;
    let amountRemaining = populatedOrder.shoot_cost || 0;
    
    if (populatedOrder.payment) {
      if (populatedOrder.payment.payment_status === 'paid') {
        paymentStatus = 'Paid';
        amountPaid = populatedOrder.payment.amount_paid || 0;
        amountRemaining = populatedOrder.payment.amount_remaining || 0;
      } else if (populatedOrder.payment.payment_status === 'partially_paid') {
        paymentStatus = 'Partially Paid';
        amountPaid = populatedOrder.payment.amount_paid || 0;
        amountRemaining = populatedOrder.payment.amount_remaining || 0;
      }
    }
    
    // Get service provider names
    const serviceProviders = populatedOrder.cp_ids.map(cp => {
      const provider = cp.id;
      return provider ? provider.name : 'N/A';
    }).join(', ');

    // Create a professional HTML template for the invoice - matching the design of generateInvoiceHtml
    const invoiceHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice ${invoiceNumber}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            background-color: #f9f9f9;
          }
          .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 30px;
            background-color: #fff;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
          }
          .invoice-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            align-items: center;
          }
          .invoice-branding {
            display: flex;
            flex-direction: column;
          }
          .logo-placeholder {
            width: 80px;
            height: 80px;
            background-color: #f0f0f0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: #555;
            margin-bottom: 10px;
          }
          .invoice-title {
            font-size: 32px;
            font-weight: 700;
            color: #2c3e50;
            letter-spacing: 1px;
          }
          .invoice-number {
            font-size: 16px;
            color: #7f8c8d;
            margin-top: 5px;
          }
          .company-details {
            text-align: right;
          }
          .company-details h2 {
            margin: 0 0 5px;
            color: #2c3e50;
          }
          .company-details p {
            margin: 0;
            color: #7f8c8d;
            line-height: 1.5;
          }
          .invoice-meta {
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
          }
          .meta-item {
            flex: 1;
          }
          .meta-label {
            font-size: 12px;
            text-transform: uppercase;
            color: #95a5a6;
            margin-bottom: 5px;
          }
          .meta-value {
            font-size: 16px;
            font-weight: 600;
            color: #2c3e50;
          }
          .invoice-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          .client-details, .order-details {
            flex-basis: 48%;
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
          }
          .detail-row {
            margin-bottom: 10px;
            display: flex;
          }
          .detail-label {
            font-weight: 600;
            color: #7f8c8d;
            width: 140px;
          }
          .detail-value {
            color: #2c3e50;
            flex: 1;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border-radius: 6px;
            overflow: hidden;
          }
          .invoice-table th {
            background-color: #2c3e50;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
          }
          .invoice-table td {
            padding: 15px;
            border-bottom: 1px solid #e0e0e0;
          }
          .invoice-table tr:nth-child(even) {
            background-color: #f8f9fa;
          }
          .invoice-table tr:last-child td {
            border-bottom: none;
          }
          .invoice-summary {
            margin-top: 30px;
            margin-left: auto;
            width: 350px;
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-row.total {
            font-weight: 700;
            font-size: 18px;
            color: #2c3e50;
            border-top: 2px solid #2c3e50;
            padding-top: 15px;
            margin-top: 10px;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .status-paid {
            background-color: #27ae60;
            color: white;
          }
          .status-partial {
            background-color: #f39c12;
            color: white;
          }
          .status-pending {
            background-color: #e74c3c;
            color: white;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #7f8c8d;
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
            padding-top: 20px;
          }
          .footer p {
            margin: 5px 0;
          }
          .thank-you {
            font-size: 24px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 10px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <div class="invoice-branding">
              <div class="logo-placeholder">BEIGE</div>
              <div class="invoice-title">INVOICE</div>
              <div class="invoice-number">${invoiceNumber}</div>
            </div>
            <div class="company-details">
              <h2>Beige Corporation</h2>
              <p>
                123 Photography Lane<br>
                San Francisco, CA 94107<br>
                United States<br>
                contact@beigecorp.com
              </p>
            </div>
          </div>
          
          <div class="invoice-meta">
            <div class="meta-item">
              <div class="meta-label">Date Issued</div>
              <div class="meta-value">${date}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Status</div>
              <div class="meta-value">
                <span class="status-badge ${paymentStatus === 'Paid' ? 'status-paid' : paymentStatus === 'Partially Paid' ? 'status-partial' : 'status-pending'}">
                  ${paymentStatus}
                </span>
              </div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Order ID</div>
              <div class="meta-value">${populatedOrder._id.toString().slice(-6)}</div>
            </div>
          </div>
          
          <div class="invoice-details">
            <div class="client-details">
              <div class="section-title">Client Information</div>
              <div class="detail-row">
                <div class="detail-label">Name:</div>
                <div class="detail-value">${populatedOrder.client_id ? populatedOrder.client_id.name : 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Email:</div>
                <div class="detail-value">${populatedOrder.client_id ? populatedOrder.client_id.email : 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Contact:</div>
                <div class="detail-value">${populatedOrder.client_id && populatedOrder.client_id.contact_number ? populatedOrder.client_id.contact_number : 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Location:</div>
                <div class="detail-value">${populatedOrder.client_id && populatedOrder.client_id.location ? populatedOrder.client_id.location : 'N/A'}</div>
              </div>
            </div>
            
            <div class="order-details">
              <div class="section-title">Order Details</div>
              <div class="detail-row">
                <div class="detail-label">Order Name:</div>
                <div class="detail-value">${populatedOrder.order_name || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Order Status:</div>
                <div class="detail-value">${populatedOrder.order_status || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Service Type:</div>
                <div class="detail-value">${populatedOrder.service_type || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Provider(s):</div>
                <div class="detail-value">${serviceProviders}</div>
              </div>
            </div>
          </div>
          
          <table class="invoice-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Service Provider(s)</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${populatedOrder.service_type || 'Photography Services'} - ${populatedOrder.order_name || 'Photography Session'}</td>
                <td>${serviceProviders}</td>
                <td>$${(populatedOrder.shoot_cost || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="invoice-summary">
            <div class="summary-row">
              <div>Subtotal:</div>
              <div>$${(populatedOrder.shoot_cost || 0).toFixed(2)}</div>
            </div>
            <div class="summary-row">
              <div>Total Paid:</div>
              <div>$${amountPaid.toFixed(2)}</div>
            </div>
            <div class="summary-row total">
              <div>Amount Due:</div>
              <div>$${amountRemaining.toFixed(2)}</div>
            </div>
          </div>
          
          <div class="thank-you">Thank You For Your Business!</div>
          
          <div class="footer">
            <p>If you have any questions regarding this invoice, please contact our support team.</p>
            <p>&copy; ${new Date().getFullYear()} Beige Corporation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Use html-pdf to generate PDF
    const pdf = require('html-pdf');
    
    return new Promise((resolve, reject) => {
      const options = {
        format: 'A4',
        border: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      };
      
      pdf.create(invoiceHtml, options).toBuffer((err, buffer) => {
        if (err) {
          console.error('PDF generation error:', err);
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  } catch (error) {
    console.error('Error generating PDF invoice:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to generate PDF invoice: ${error.message}`);
  }
};

module.exports = {
  createOrder,
  queryOrders,
  getOrderById,
  getOrderByUserId,
  updateOrderById,
  deleteOrderById,
  removeMeetingFromOrder,
  checkOrderId,
  getBusyArea,
  updateOrderMediaLinks,
  generateInvoiceHtml,
  generateProfessionalInvoicePDF,
  // Helper functions for naming convention
  generateUniqueShootId,
  formatClientNameForShoot,
  generateOrderName,
  migrateOrderNaming,
};