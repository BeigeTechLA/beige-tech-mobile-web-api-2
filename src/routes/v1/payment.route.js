const express = require("express");
const paymentController = require("../../controllers/payment.controller");
const auth = require("../../middlewares/auth");

const router = express.Router();

router.route("/:id").get(paymentController.getPaymentById);

router.route("/intent/:id").get(paymentController.getPaymentIntentById);

router
  .route("/secret/:order_id")
  .get(paymentController.getClientSecretByOrderId);

router.route("/webhook").post(paymentController.handleWebHook);
router.post("/create_intent/:id", paymentController.createPaymentIntent);
module.exports = router;
