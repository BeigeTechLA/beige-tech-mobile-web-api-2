/**
 * Dispute Service
 */

const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { Dispute, Order } = require("../models");
const { orderService } = require("../services");
const ApiError = require("../utils/ApiError");
const { sendNotification } = require("./fcm.service");

/**
 * Create a dispute
 * @param {Object} reqBody - Request body containing dispute data
 * @param {Array} fileUrls - Array of uploaded file URLs
 * @throws {ApiError} - If an error occurs while creating the dispute
 * @returns {Promise<Object>} - Created dispute object
 */
const createDispute = async (reqBody, fileUrls = []) => {
  //Deconstruct order_id from request body
  const { order_id } = reqBody;

  //Check if order is valid
  await orderService.checkOrderId(order_id, true);

  try {
    // Add file URLs to request body if provided
    if (fileUrls && fileUrls.length > 0) {
      reqBody.fileUrls = fileUrls;
    }
    
    //Create dispute record
    const dispute = await Dispute.create(reqBody);

    //Fetch order data
    const order = await Order.findById(order_id);
    await Order.findByIdAndUpdate(
      order_id,
      { order_status: "in_dispute" },
      {
        new: true,
        runValidators: true,
      }
    );
    //Prepare notification title and content
    const notificationTitle = "New dispute placed";
    const NotificationContent = `New dispute for order: ${order.order_name}. Please review and take necessary action`;

    //Send notification to the cp
    // sendNotification(order.cp_id, notificationTitle, NotificationContent, {
    //   type: "newDispute",
    //   disputeId: dispute._id.toString(),
    // });
    order.cp_ids.forEach((cp) => {
      const cpId = cp.id.toString();
      sendNotification(cpId, notificationTitle, NotificationContent, {
        type: "newDispute",
        disputeId: dispute._id.toString(),
        id: dispute._id.toString(),
      });
    });

    //Return dispute object`
    return dispute;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get disputes with pagination and sorting options
 * @param {Object} options - Pagination and sorting options
 * @param {String} client_id - Optional client ID to filter disputes
 * @returns {Promise<Object>} - Paginated list of disputes
 */
const getDisputes = async (options, client_id) => {
  if (client_id) {
    try {
      const pipeline = [
        {
          $lookup: {
            from: "orders",
            localField: "order_id",
            foreignField: "_id",
            as: "order",
          },
        },
        {
          $match: {
            $or: [
              { "order.client_id": new mongoose.Types.ObjectId(client_id) },
              { "order.cp_ids.id": new mongoose.Types.ObjectId(client_id) },
            ],
          },
        },
        {
          $project: {
            __v: 0,
          },
        },
        {
          $addFields: {
            cp_ids: "$order.cp_ids",
            client_id: { $arrayElemAt: ["$order.client_id", 0] },
          },
        },
        {
          $unset: "order",
        },
      ];

      const paginationPipeline = [
        {
          $facet: {
            paginatedResults: [
              { $skip: (parseInt(options.page) - 1) * parseInt(options.limit) },
              { $limit: parseInt(options.limit) },
            ],
            totalCount: [{ $count: "total" }],
          },
        },
      ];

      // Combine the pipelines
      const combinedPipeline = [...pipeline, ...paginationPipeline];
      const result = await Dispute.aggregate(combinedPipeline);
      const paginatedResults = result[0].paginatedResults;
      const totalCount =
        result[0].totalCount.length > 0 ? result[0].totalCount[0].total : 0;

      return {
        results: paginatedResults,
        page: parseInt(options.page) || 1,
        limit: parseInt(options.limit) || 10,
        totalPages: Math.ceil(totalCount / (parseInt(options.limit) || 10)),
        totalResults: totalCount,
      };
    } catch (error) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
  }
  
  // If no client_id is provided, use the original pagination method
  return Dispute.paginate({}, options);
};

/**
 * Get dispute by ID
 * @param {string} dispute_id - Dispute ID
 * @throws {ApiError} - If the dispute ID is invalid
 * @returns {Promise<Object>} - Dispute object
 */
const getDisputeById = async (dispute_id) => {
  try {
    return await Dispute.findById(dispute_id).populate({
      path: "order_id",
      select: "order_name shoot_cost shoot_datetimes order_status",
    });
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dispute ID");
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get disputes by order ID
 * @param {string} order_id - Order ID
 * @throws {ApiError} - If an error occurs while fetching disputes
 * @returns {Promise<Array>} - List of disputes
 */
const getDisputeByOrderId = async (order_id) => {
  await orderService.checkOrderId(order_id);
  try {
    return await Dispute.find({
      order_id: order_id,
    });
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getDisputesByUserId = async (userId, options) => {
  try {
    const pipeline = [
      {
        $lookup: {
          from: "orders",
          localField: "order_id",
          foreignField: "_id",
          as: "order",
        },
      },
      {
        $match: {
          $or: [
            { "order.client_id": new mongoose.Types.ObjectId(userId) },
            { "order.cp_ids.id": new mongoose.Types.ObjectId(userId) },
          ],
        },
      },
      {
        $project: {
          __v: 0,
        },
      },
      {
        $addFields: {
          cp_ids: "$order.cp_ids",
          client_id: { $arrayElemAt: ["$order.client_id", 0] },
        },
      },
      {
        $unset: "order",
      },
      {
        $unwind: "$cp_ids", // Unwind the cp_ids array
      },
    ];

    const paginationPipeline = [
      {
        $facet: {
          paginatedResults: [
            { $skip: (options.page - 1) * options.limit },
            { $limit: options.limit },
          ],
          totalCount: [{ $count: "total" }],
        },
      },
    ];

    // Combine the pipelines
    const combinedPipeline = [...pipeline, ...paginationPipeline];
    const result = await Dispute.aggregate(combinedPipeline);
    const paginatedResults = result[0].paginatedResults;
    const totalCount =
      result[0].totalCount.length > 0 ? result[0].totalCount[0].total : 0;

    return {
      results: paginatedResults,
      page: options.page,
      limit: options.limit,
      totalPages: Math.ceil(totalCount / options.limit),
      totalResults: totalCount,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Update dispute by ID
 * @param {string} disputeId - Dispute ID
 * @param {Object} updateData - Updated dispute data
 * @throws {ApiError} - If the dispute ID is invalid or the update fails
 * @returns {Promise<Object>} - Updated dispute object
 */
const updateDisputeById = async (disputeId, updateData) => {
  const { order_id } = updateData;

  await orderService.checkOrderId(order_id);

  try {
    const dispute = await Dispute.findById(disputeId);
    const currentStatus = dispute.status;

    if (!dispute) {
      throw new ApiError(httpStatus.NOT_FOUND, "Dispute not found");
    }

    //Update the dispute record
    Object.assign(dispute, updateData);
    dispute.save();

    //Check if the dispute status has changed
    if ("status" in updateData && updateData.status !== currentStatus) {
      //Fetch order data
      const order = await Order.findById(order_id);

      //Prepare notification title and content
      const notificationTitle = "Dispute Status Update";
      const NotificationContent = `The dispute status for the associated order ${order.order_name} has changed from ${currentStatus} to ${updateData.status}`;

      //Send notification to the cp
      // sendNotification(order.cp_id, notificationTitle, NotificationContent, {
      //   type: "disputeStatusUpdate",
      //   disputeId: disputeId.toString(),
      //   status: updateData.status,
      // });
      order.cp_ids.forEach((cp) => {
        const cpId = cp.id.toString();
        sendNotification(cpId, notificationTitle, NotificationContent, {
          type: "disputeStatusUpdate",
          disputeId: disputeId.toString(),
          id: disputeId.toString(),
          status: updateData.status,
        });
      });
    }

    return dispute;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dispute ID");
    }
    throw error;
  }
};

/**
 * Delete dispute by ID
 * @param {string} disputeId - Dispute ID
 * @throws {ApiError} - If the dispute ID is invalid or the deletion fails
 * @returns {Promise<void>}
 */
const deleteDisputeById = async (disputeId) => {
  try {
    const deletedDispute = await Dispute.findByIdAndDelete(disputeId);

    if (deletedDispute === null) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dispute ID");
    }
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dispute ID");
    }
    throw error;
  }
};

const checkDispute = async (orderId, disputeType) => {
  try {
    const targetDispute = await Dispute.findOne({
      order_id: orderId,
      type: disputeType,
    });
    return !targetDispute;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

module.exports = {
  createDispute,
  getDisputes,
  getDisputeById,
  getDisputeByOrderId,
  getDisputesByUserId,
  updateDisputeById,
  deleteDisputeById,
  checkDispute,
};
