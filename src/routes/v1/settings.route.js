const express = require("express");
const router = express.Router();
const settingController = require("../../controllers/setting.controller");

/**
 * @route GET /algo/search
 * @description Route for retrieving search algorithm parameters.
 * @access Public
 */
router.get("/algo/search", settingController.getSearchAlgoParams);

/**
 * @route PATCH /algo/search
 * @description Route for updating search algorithm parameters.
 * @access Public
 */
router.patch("/algo/search", settingController.updateSearchAlgoParams);
// POST, GET, PATCH, This route  for basic settings
router.post("/basic", settingController.createBasicSettings);
router.get("/basic", settingController.getAllSettings);

module.exports = router;
