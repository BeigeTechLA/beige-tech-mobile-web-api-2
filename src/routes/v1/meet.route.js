const express = require("express");
const meetTokenController = require("../../controllers/MeetToken.controller");

const router = express.Router();

router
  .route("/")
  .post(meetTokenController.createMeetToken)
  .get(meetTokenController.oauth2callback);

module.exports = router;
