const express = require("express");
const supportController = require("../../controllers/support.controller");

const router = express.Router();

router
  .route("/")
  .get(supportController.getAllSupports)
  .post(supportController.createSupport)
  .delete(supportController.deleteSupport)
  .put(supportController.updateSupport);

router.route("/:id").get(supportController.getSupportById);

module.exports = router;
