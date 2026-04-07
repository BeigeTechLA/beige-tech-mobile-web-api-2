/**
 * File Comment Routes
 * This module defines the routes related to file comments and reactions.
 */

const express = require("express");
const router = express.Router();
const fileCommentController = require("../../controllers/fileComment.controller");
const auth = require("../../middlewares/auth");

// All routes require authentication
// router.use(auth());

// Add a new top-level comment to a file
router.post("/", fileCommentController.addComment);

// Add a reply to an existing comment
router.post("/:id/reply", fileCommentController.replyToComment);

// Add or update a reaction to a comment
router.post("/:id/react", fileCommentController.reactToComment);

// Remove a reaction from a comment
router.delete("/:id/react", fileCommentController.removeReaction);

// Get all comments for a file
router.get("/", fileCommentController.getCommentsByMetaId);

// Delete a comment and its replies
router.delete("/:id", fileCommentController.deleteComment);

module.exports = router;
