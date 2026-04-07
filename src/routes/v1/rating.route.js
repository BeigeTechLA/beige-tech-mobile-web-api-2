const express = require("express");
const auth = require("../../middlewares/auth");
const validate = require("../../middlewares/validate");
const rattingController = require("../../controllers/rating.controller");

const router = express.Router();

// GET ratings
router.route("/").get(rattingController.getRatings);

/*
Define Buyer to Seller Routes
*/
// Get buyer to seller ratings
router.route("/seller")
  .get(rattingController.getSellerRatings)
  .post(rattingController.rateSeller);

router.route("/seller/:id")
    .get(rattingController.getSellerRatingsBySellerId);


/*
Define Seller to Buyer Routes
*/
//Get seller to buyer ratings
router.route("/buyer")
  .get(rattingController.getBuyerRatings)
  .post(rattingController.rateBuyer);

router.route("/buyer/:id")
    .get(rattingController.getBuyerRatingsByBuyerId);

router.route("/:id").get(rattingController.getRatingById);

module.exports = router;
