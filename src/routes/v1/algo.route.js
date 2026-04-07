const express = require("express");
const algoController = require("../../controllers/algo.controller");

const router = express.Router();

router
  .route("/")
  .get(algoController.matchOrderWithCp)
  .post(algoController.setAlgoParams);


router
  .route("/paramList")
  .get(algoController.getAllParams)

module.exports = router;
