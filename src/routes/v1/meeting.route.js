const express = require("express");
const meetingController = require("../../controllers/meeting.controller");
const auth = require("../../middlewares/auth");
const { checkUserPermission } = require("../../middlewares/permissions");

const router = express.Router();

router
  .route("/")
  .get(checkUserPermission(["meeting_page"]), meetingController.getMeetings)
  .post(meetingController.createMeeting);

router
  .route("/:meetingId")
  .get(
    checkUserPermission(["meeting_details"]),
    meetingController.getMeetingById
  );
router.route("/order/:orderId").get(meetingController.getMeetingsByOrderId);
router.route("/user/:userId").get(meetingController.getMeetingsByUserId);
router.route("/:meeting_id").patch(meetingController.updateMeeting);

router
  .route("/schedule/:meeting_id")
  .post(
    checkUserPermission(["meeting_details_reschedule"]),
    meetingController.placeChangeRequest
  );

router
  .route("/schedule/:meeting_id/:status")
  .patch(meetingController.updateChangeRequestStatus);

// Participant management routes
router
  .route("/:meetingId/participants")
  .post(meetingController.addParticipants);

router
  .route("/:meetingId/participants/:userId")
  .delete(meetingController.removeParticipant);

// Meeting invitation response route
router
  .route("/:meetingId/respond")
  .patch(auth(), meetingController.respondToMeetingInvitation);

router.route("/:meeting_id").delete(meetingController.deleteMeeting);

module.exports = router;
