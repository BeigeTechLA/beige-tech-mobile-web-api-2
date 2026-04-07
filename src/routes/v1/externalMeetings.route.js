const express = require("express");
const auth = require("../../middlewares/auth");
const externalMeetingsController = require("../../controllers/externalMeetings.controller");

const router = express.Router();

router
  .route("/")
  .get(auth(), externalMeetingsController.getAllMeetings)
  .post(auth(), externalMeetingsController.createMeeting);

router.get("/order/:orderId", auth(), externalMeetingsController.getMeetingsByOrder);
router.get("/user/:userId", auth(), externalMeetingsController.getMeetingsByUser);
router.get("/:meetingId", auth(), externalMeetingsController.getMeetingById);
router.patch("/:meetingId", auth(), externalMeetingsController.updateMeeting);
router.delete("/:meetingId", auth(), externalMeetingsController.deleteMeeting);

router.post("/create-event", auth(), externalMeetingsController.createMeetEvent);
router.post("/schedule/:meetingId", auth(), externalMeetingsController.placeChangeRequest);
router.patch(
  "/schedule/:meetingId/:status",
  auth(),
  externalMeetingsController.updateChangeRequestStatus
);

router.post("/:meetingId/participants", auth(), externalMeetingsController.addParticipants);
router.delete(
  "/:meetingId/participants/:userId",
  auth(),
  externalMeetingsController.removeParticipant
);
router.patch(
  "/:meetingId/respond",
  auth(),
  externalMeetingsController.respondToMeetingInvitation
);

module.exports = router;
