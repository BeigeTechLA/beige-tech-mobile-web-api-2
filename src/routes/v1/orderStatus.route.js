const express = require('express');
const { orderStatusController } = require('../../controllers');
const auth = require('../../middlewares/auth');

const router = express.Router();

// Update order status by order ID
router.patch('/orders/status/:orderId',orderStatusController.updateOrderStatus);

// Cancel a content provider's participation in an order
router.patch('/orders/cp-cancel/:orderId/:cpId',orderStatusController.cancelContentProvider);

// Get all roles where is_delete is false
router.get('/roles/all', orderStatusController.getAllRoles);

// Get review information by order ID
router.get('/orders/review/:orderId', orderStatusController.getReviewByOrderId);

module.exports = router;
