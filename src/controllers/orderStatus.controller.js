const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { Order, Review, Role } = require("../models");
const mongoose = require("mongoose");
const { orderService } = require("../services");

/**
 * Update order status by order ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateOrderStatus = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const { order_status } = req.body;

  if (!order_status) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Order status is required");
  }

  // Find the order by ID to validate payment status
  const existingOrder = await Order.findById(orderId);
  if (!existingOrder) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  // Check if the new status is "completed" and payment_status is not "paid" or "partially_paid"
  if (order_status === "completed" &&
      existingOrder.payment.payment_status !== "paid" &&
      existingOrder.payment.payment_status !== "partially_paid") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot mark order as completed when payment status is pending"
    );
  }

  // Pass the user who is making the update to exclude them from notifications
  const updatedBy = req.user ? {
    userId: req.user._id || req.user.id,
    role: req.user.role
  } : null;

  // Update the order status using the service (handles notifications properly)
  const order = await orderService.updateOrderById(
    orderId,
    { order_status },
    updatedBy
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: "Order status updated successfully",
    data: {
      order_id: order.id,
      order_status: order.order_status,
      payment_status: order.payment.payment_status,
    },
  });
});

/**
 * Cancel a content provider's participation in an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const cancelContentProvider = catchAsync(async (req, res) => {
  const { orderId, cpId } = req.params;

  // Validate ObjectIds
  if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(cpId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID or content provider ID");
  }

  // Find the order by ID
  const order = await Order.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  // Find the content provider in the order's cp_ids array
  const cpIndex = order.cp_ids.findIndex(cp => cp.id.toString() === cpId);
  
  if (cpIndex === -1) {
    throw new ApiError(httpStatus.NOT_FOUND, "Content provider not found in this order");
  }

  // Update the content provider's decision to "cancelled"
  order.cp_ids[cpIndex].decision = "cancelled";
  await order.save();

  res.status(httpStatus.OK).send({
    success: true,
    message: "Content provider cancelled successfully",
    data: {
      order_id: order.id,
      cp_id: cpId,
      decision: "cancelled",
    },
  });
});

/**
 * Get all roles where is_delete is false
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllRoles = catchAsync(async (req, res) => {
  const roles = await Role.find({ is_delete: false }).lean();
  
  // Unset the permissions key from each role
  roles.forEach(role => {
    delete role.permissions;
  });
  
  res.status(httpStatus.OK).send({
    success: true,
    count: roles.length,
    data: roles,
  });
});

/**
 * Get review information by order ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getReviewByOrderId = catchAsync(async (req, res) => {
  const { orderId } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID");
  }

  // Find reviews for the given order ID
  const reviews = await Review.find({ order_id: orderId })
    .populate('client_id', 'name email profile_image')
    .populate('cp_ids.id', 'name email profile_image')
    .populate('order_id');

  if (!reviews || reviews.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "No reviews found for this order");
  }

  res.status(httpStatus.OK).send({
    success: true,
    count: reviews.length,
    data: reviews,
  });
});

module.exports = {
  updateOrderStatus,
  cancelContentProvider,
  getAllRoles,
  getReviewByOrderId,
};
