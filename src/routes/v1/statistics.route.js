const express = require("express");
const router = express.Router();
const statistics = require("../../controllers/statistics.controller");

/**
 * @route GET /algo/search
 * @description Route for retrieving search algorithm parameters.
 * @access Public
 */
router.get("/total", statistics.getStatistics);
router.get("/yearly", statistics.getYearlyStatistics);
router.get("/category", statistics.getCategoryStatistics);

module.exports = router;
