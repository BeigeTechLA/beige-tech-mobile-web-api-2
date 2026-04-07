const express = require("express");
const bankInfoController = require("../../controllers/bankInfo.controller");
const bankInfoValidator = require("../../middlewares/bankInfoValidator");

const router = express.Router();

router
  .route("/")
  .get(bankInfoController.getAllBankInfo)
  .post(bankInfoValidator, bankInfoController.saveBankInfo);

router.route("/:userId").get(bankInfoController.getBankInfoByUserId);
router
  .route("/:id")
  .delete(bankInfoController.deleteBankInfoById)
  .patch(bankInfoController.updateBankInfoById);

module.exports = router;
