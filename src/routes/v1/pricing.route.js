const express = require("express");
const pricingController = require("../../controllers/pricing.controller");

const router = express.Router();

router
  .route("/")
  .post(pricingController.createPricing)
  .get(pricingController.getPrices);
router.get("/:id", pricingController.getPriceById);
router.patch("/:id", pricingController.updatePriceById);

module.exports = router;
