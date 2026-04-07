const express = require("express");
const auth = require("../../middlewares/auth");
const validate = require("../../middlewares/validate");
const orderValidation = require("../../validations/order.validation");
const orderController = require("../../controllers/order.controller");
const { checkUserPermission } = require("../../middlewares/permissions");

// Import the flexible upload middleware
const flexibleUpload = require("../../middlewares/flexibleUpload");

const router = express.Router();
router.route("/busy-area").get(orderController.getBusyArea);

router
  .route("/")
  .post(checkUserPermission(["booking_page"]), orderController.createOrder)
  .get(checkUserPermission(["shoot_page"]), orderController.getOrders);

router
  .route("/:orderId")
  .get(checkUserPermission(["shoot_show_details"]), orderController.getOrder)
  .patch(orderController.updateOrder)
  .delete(orderController.deleteOrder);

/**
 * @route GET /orders/:orderId/files
 * @description Get all files for a specific order
 */
router
  .route("/:orderId/files")
  .get(orderController.getOrderFiles);

/**
 * @route POST /orders/:orderId/media
 * @description Upload media files and platform links to an order
 */
router
  .route("/:orderId/media")
  .post(
    // auth(),
    // checkUserPermission(["shoot_show_details"]),
    flexibleUpload('files', 5), // Flexible middleware that handles both files and JSON-only requests
    orderController.uploadOrderMedia
  )
  .get(
    orderController.getOrderMediaLinks
  );

/**
 * @route GET /orders/media
 * @description Get media links for an order by ID in query parameter
 */
router
  .route("/media")
  .get(orderController.getOrderMediaLinks);

/**
 * @route GET /orders/:orderId/invoice
 * @description Download HTML invoice for an order
 */
router
  .route("/:orderId/invoice")
  .get(orderController.downloadInvoice);

/**
 * @route GET /orders/:orderId/professional-invoice
 * @description Download professional PDF invoice for an order
 */
router
  .route("/:orderId/download-invoice")
  .get(orderController.downloadProfessionalInvoice);

/**
 * @route POST /orders/:orderId/assign-creative
 * @description Assign a creative to an order and send notification email
 */
router
  .route("/:orderId/assign-creative")
  .post(orderController.assignCreative);

/**
 * @route POST /orders/:orderId/assign-creative-by-email
 * @description Assign a creative partner to order by email (adds to cp_ids array)
 */
router
  .route("/:orderId/assign-creative-by-email")
  .post(orderController.assignCreativeByEmail);

module.exports = router;
