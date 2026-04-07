/**
 * File Comment Service
 * This module contains service functions for managing file comments and reactions.
 */

const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const FileComment = require("../models/fileComment.model");
const User = require("../models/user.model");

const normalizeStoredId = (value) => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized || null;
  }

  const nested = value._id ?? value.id ?? value.user_id ?? value.userId ?? null;
  if (nested == null) return null;
  const normalized = String(nested).trim();
  return normalized || null;
};

const toUserPayload = async (value) => {
  const id = normalizeStoredId(value);
  if (!id) {
    return {
      id: null,
      name: "Unknown User",
      email: null,
      profile_picture: null,
    };
  }

  if (value && typeof value === "object" && (value.name || value.email || value.profile_picture)) {
    return {
      id,
      name: value.name || value.email || id,
      email: value.email || null,
      profile_picture: value.profile_picture || null,
    };
  }

  if (User.db && require("mongoose").Types.ObjectId.isValid(id)) {
    const user = await User.findById(id).select("name email profile_picture").lean();
    if (user) {
      return {
        id,
        name: user.name || user.email || id,
        email: user.email || null,
        profile_picture: user.profile_picture || null,
      };
    }
  }

  return {
    id,
    name: id,
    email: null,
    profile_picture: null,
  };
};

const serializeComment = async (comment) => {
  const raw = comment?.toJSON ? comment.toJSON() : comment;
  const replies = Array.isArray(raw?.replies) ? raw.replies : [];

  return {
    ...raw,
    userId: await toUserPayload(raw?.userId),
    reactions: await Promise.all(
      (raw?.reactions || []).map(async (reaction) => ({
        ...reaction,
        userId: await toUserPayload(reaction?.userId),
      }))
    ),
    replies: await Promise.all(replies.map((reply) => serializeComment(reply))),
  };
};

/**
 * Create a new comment on a file
 * @param {Object} commentBody - The comment data
 * @returns {Promise<FileComment>} - The created comment
 */
const createComment = async (commentBody) => {
  return FileComment.create(commentBody);
};

/**
 * Create a reply to an existing comment
 * @param {string} commentId - The ID of the parent comment
 * @param {Object} replyBody - The reply data
 * @returns {Promise<FileComment>} - The created reply
 */ 
const createReply = async (commentId, replyBody) => {
  const parentComment = await FileComment.findById(commentId);
  if (!parentComment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Parent comment not found');
  }
  
  // Ensure the reply is for the same file
  replyBody.fileMetaId = parentComment.fileMetaId;
  replyBody.parentId = commentId;
  
  return FileComment.create(replyBody);
};

/**
 * Add or update a reaction to a comment
 * @param {string} commentId - The ID of the comment to react to
 * @param {Object} reactionBody - The reaction data (userId, type)
 * @returns {Promise<FileComment>} - The updated comment
 */
const addOrUpdateReaction = async (commentId, reactionBody) => {
  const comment = await FileComment.findById(commentId);
  if (!comment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Comment not found');
  }

  // Check if user already has a reaction
  const existingReactionIndex = comment.reactions.findIndex(
    (reaction) => reaction.userId.toString() === reactionBody.userId.toString()
  );

  if (existingReactionIndex !== -1) {
    // Update existing reaction
    comment.reactions[existingReactionIndex].type = reactionBody.type;
  } else {
    // Add new reaction
    comment.reactions.push(reactionBody);
  }

  await comment.save();
  return comment;
};

/**
 * Remove a reaction from a comment
 * @param {string} commentId - The ID of the comment
 * @param {string} userId - The ID of the user removing their reaction
 * @returns {Promise<FileComment>} - The updated comment
 */
const removeReaction = async (commentId, userId) => {
  const comment = await FileComment.findById(commentId);
  if (!comment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Comment not found');
  }

  // Filter out the user's reaction
  comment.reactions = comment.reactions.filter(
    (reaction) => reaction.userId.toString() !== userId.toString()
  );

  await comment.save();
  return comment;
};

/**
 * Get all comments for a file with their replies
 * @param {string} fileMetaId - The ID of the file
 * @param {Object} options - Query options (pagination, etc.)
 * @returns {Promise<Object>} - Paginated comments with replies
 */
const getCommentsByFileMetaId = async (fileMetaId, options) => {
  // First, get all top-level comments (no parentId)
  const topLevelComments = await FileComment.paginate(
    { fileMetaId, parentId: null },
    {
      ...options,
    }
  );

  // Get all comment IDs to fetch their replies
  const commentIds = topLevelComments.results.map(comment => comment._id);

  // Fetch all replies for these comments
  const replies = await FileComment.find({ parentId: { $in: commentIds } })
    .sort({ createdAt: 1 });

  // Group replies by parent comment ID
  const repliesByParentId = {};
  replies.forEach(reply => {
    const parentId = reply.parentId.toString();
    if (!repliesByParentId[parentId]) {
      repliesByParentId[parentId] = [];
    }
    repliesByParentId[parentId].push(reply);
  });

  // Add replies to their parent comments
  topLevelComments.results = await Promise.all(
    topLevelComments.results.map(async (comment) => {
      const commentObj = comment.toJSON();
      commentObj.replies = repliesByParentId[comment._id.toString()] || [];
      return serializeComment(commentObj);
    })
  );

  return topLevelComments;
};

/**
 * Delete a comment and its replies
 * @param {string} commentId - The ID of the comment to delete
 * @param {string} userId - The ID of the user attempting to delete
 * @returns {Promise<boolean>} - True if deleted successfully
 */
const deleteComment = async (commentId, userId) => {
  const comment = await FileComment.findById(commentId);
  if (!comment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Comment not found');
  }

  // Only allow the comment author to delete it
  if (comment.userId.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only delete your own comments');
  }

  // Delete the comment and all its replies
  await FileComment.deleteMany({ $or: [{ _id: commentId }, { parentId: commentId }] });
  
  return true;
};

/**
 * Get all comments for a file without pagination
 * @param {string} fileMetaId - The ID of the file
 * @returns {Promise<Object>} - All comments with replies
 */
const getAllCommentsByFileMetaId = async (fileMetaId) => {
  // Get all top-level comments (no parentId)
  const topLevelComments = await FileComment.find({ fileMetaId, parentId: null })
    .sort({ createdAt: -1 }); // Newest first

  // Get all comment IDs to fetch their replies
  const commentIds = topLevelComments.map(comment => comment._id);

  // Fetch all replies for these comments
  const replies = await FileComment.find({ parentId: { $in: commentIds } })
    .sort({ createdAt: 1 }); // Oldest first for replies

  // Group replies by parent comment ID
  const repliesByParentId = {};
  replies.forEach(reply => {
    const parentId = reply.parentId.toString();
    if (!repliesByParentId[parentId]) {
      repliesByParentId[parentId] = [];
    }
    repliesByParentId[parentId].push(reply);
  });

  // Add replies to their parent comments
  const commentsWithReplies = await Promise.all(
    topLevelComments.map(async (comment) => {
      const commentObj = comment.toJSON();
      commentObj.replies = repliesByParentId[comment._id.toString()] || [];
      return serializeComment(commentObj);
    })
  );

  return commentsWithReplies;
};

module.exports = {
  createComment,
  createReply,
  addOrUpdateReaction,
  removeReaction,
  getCommentsByFileMetaId,
  getAllCommentsByFileMetaId,
  deleteComment,
};
