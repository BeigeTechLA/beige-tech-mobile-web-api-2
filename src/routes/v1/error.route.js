const express = require("express");
const errorController = require("../../controllers/error.controller.js");

const router = express.Router();

router.route("/").get(errorController.error403);

module.exports = router;
