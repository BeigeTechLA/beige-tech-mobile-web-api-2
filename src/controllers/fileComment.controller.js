/**
 * File Comment Controller
 * This module contains controller functions for handling file comment operations.
 */

const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { fileCommentService } = require("../services");
const pick = require("../utils/pick");

/**
 * Add a new comment to a file
 * @route POST /comments
 */
const addComment = catchAsync(async (req, res) => {
  const commentData = {
    fileMetaId: req.body.fileMetaId,
    userId: req.body.user_id, // Get user ID from authenticated request
    comment: req.body.comment,
    timestamp: req.body.timestamp || null, // Video timestamp in seconds (Frame.io style)
    parentId: null // Top-level comment
  };

  const comment = await fileCommentService.createComment(commentData);
  res.status(httpStatus.CREATED).send(comment);
});

/**
 * Add a reply to an existing comment
 * @route POST /comments/:id/reply
 */
const replyToComment = catchAsync(async (req, res) => {
  const { id: commentId } = req.params;
  const replyData = {
    userId: req.body.user_id, // Get user ID from authenticated request
    comment: req.body.comment
  };

  const reply = await fileCommentService.createReply(commentId, replyData);
  res.status(httpStatus.CREATED).send(reply);
});

/**
 * Add or update a reaction to a comment
 * @route POST /comments/:id/react
 */
const reactToComment = catchAsync(async (req, res) => {
  const { id: commentId } = req.params;
  const reactionData = {
    userId: req.body.user_id, // Get user ID from request body
    type: req.body.type // 'like', 'heart', 'thumbsUp'
  };

  const comment = await fileCommentService.addOrUpdateReaction(commentId, reactionData);
  res.status(httpStatus.OK).send(comment);
});

/**
 * Remove a reaction from a comment
 * @route DELETE /comments/:id/react
 */
const removeReaction = catchAsync(async (req, res) => {
  const { id: commentId } = req.params;
  const userId = req.body.user_id;

  await fileCommentService.removeReaction(commentId, userId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get all comments for a file
 * @route GET /comments?metaId=xyz
 */
const getCommentsByMetaId = catchAsync(async (req, res) => {
  const { metaId } = req.query;
  
  if (!metaId) {
    res.status(httpStatus.BAD_REQUEST).send({ message: 'File metaId is required' });
    return;
  }

  // Get all comments without pagination
  const comments = await fileCommentService.getAllCommentsByFileMetaId(metaId);
  res.status(httpStatus.OK).send(comments);
});

/**
 * Delete a comment and its replies
 * @route DELETE /comments/:id
 */
const deleteComment = catchAsync(async (req, res) => {
  const { id: commentId } = req.params;
  const userId = req.body.user_id;

  await fileCommentService.deleteComment(commentId, userId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  addComment,
  replyToComment,
  reactToComment,
  removeReaction,
  getCommentsByMetaId,
  deleteComment,
};
