const express = require("express");
const meetTokenController = require("../../controllers/MeetToken.controller");
const { internalBridgeOrJwtAuth } = require("../../middlewares/internalBridgeAuth");

const router = express.Router();

router
  .route("/")
  .post(internalBridgeOrJwtAuth(), meetTokenController.createMeetToken)
  .get(meetTokenController.oauth2callback);

module.exports = router;
