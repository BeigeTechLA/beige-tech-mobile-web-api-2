const express = require("express");
const payoutController = require("../../controllers/payout.controller");
const bankInfoValidator = require("../../middlewares/bankInfoValidator");
const { checkUserPermission } = require("../../middlewares/permissions");

const router = express.Router();

router
  .route("/")
  .get(payoutController.getAllPayouts)
  .post(bankInfoValidator, payoutController.createWithdrawRequest);
// .get(
//   checkUserPermission(["transactions_page"]),
//   payoutController.getAllPayouts
// )

router
  .route("/:id")
  .patch(payoutController.updatePayoutData)
  .delete(payoutController.deletePayoutById);

module.exports = router;
