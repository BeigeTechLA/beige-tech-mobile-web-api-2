const express = require("express");
const publicController = require("../../controllers/public.controller");
const router = express.Router();

// Stats summary endpoint - publicly accessible
router.route("/stats/summary").get(publicController.getSummaryStats);

// Subscriber endpoints
router.route("/subscribe").post(publicController.createSubscriber);
router.route("/subscribers").get(publicController.getSubscribers);

module.exports = router;
