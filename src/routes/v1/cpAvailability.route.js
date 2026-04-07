const express = require("express");
const cpAvailabilityController = require("../../controllers/cpAvailability.controller");

const router = express.Router();

router
  .route("/")
  .post(cpAvailabilityController.createSchedule)
  .get(cpAvailabilityController.getSchedule);

router.route("/:cpId").get(cpAvailabilityController.getScheduleByCpId);
router.route("/:id").delete(cpAvailabilityController.deleteScheduleById);

module.exports = router;
