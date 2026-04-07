const httpStatus = require('http-status');
const { Note, Lead, User } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a note
 * @param {Object} noteBody
 * @returns {Promise<Note>}
 */
const createNote = async (noteBody) => {
  // Verify the lead exists
  const lead = await Lead.findById(noteBody.leadId);
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }
  
  // Verify the author exists
  const author = await User.findById(noteBody.createdBy);
  if (!author || author.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Author not found');
  }
  
  // Create the note
  const note = await Note.create(noteBody);
  
  // Add note reference to lead
  await Lead.findByIdAndUpdate(note.leadId, { 
    $push: { notes: note._id },
  });
  
  // Return populated note
  return getNoteById(note._id);
};

/**
 * Query for notes with pagination and filtering
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {boolean} [options.populate] - Whether to populate references (default = true)
 * @returns {Promise<QueryResult>}
 */
const queryNotes = async (filter, options) => {
  // Extract leadId from either options or filter
  const leadId = options.leadId || filter.leadId;
  
  if (!leadId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'leadId is required');
  }

  // Ensure leadId is present in the filter
  filter.leadId = leadId;
  
  // Apply author filter if provided
  if (options.createdBy) {
    filter.createdBy = options.createdBy;
  }
  
  // Set up populate options for the paginate plugin
  const populateOption = options.populate !== false ? 'leadId,createdBy' : '';
  
  // Use the paginate plugin
  return Note.paginate(filter, {
    sortBy: options.sortBy || 'createdAt:desc',
    limit: options.limit,
    page: options.page,
    populate: populateOption,
  });
};

/**
 * Get note by id
 * @param {ObjectId} id
 * @param {Object} options - Query options
 * @param {boolean} [options.populate] - Whether to populate references (default = true)
 * @returns {Promise<Note>}
 */
const getNoteById = async (id, options = { populate: true }) => {
  const query = Note.findById(id);
  
  if (options.populate) {
    query.populate([
      { 
        path: 'leadId', 
        select: 'status contact.name company.name description',
        populate: [
          { path: 'assigned_employees', select: 'name email profile_picture' },
          { path: 'owner', select: 'name email profile_picture' },
        ]
      },
      { path: 'createdBy', select: 'name email profile_picture' },
    ]);
  }
  
  const note = await query;
  
  if (!note || note.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
  }
  
  return note;
};

/**
 * Update note by id
 * @param {ObjectId} noteId
 * @param {Object} updateBody
 * @param {Object} options - Additional options
 * @returns {Promise<Note>}
 */
const updateNoteById = async (noteId, updateBody, options = {}) => {
  const note = await getNoteById(noteId, { populate: false });
  
  // Don't allow changing the lead ID
  if (updateBody.leadId && updateBody.leadId !== note.leadId.toString()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot change the lead ID of a note');
  }
  
  // Update the note
  Object.assign(note, {
    ...updateBody,
  });
  
  await note.save();
  
  return getNoteById(note._id);
};

/**
 * Delete note by id (hard delete)
 * @param {ObjectId} noteId
 * @returns {Promise<Object>}
 */
const deleteNoteById = async (noteId) => {
  const note = await getNoteById(noteId, { populate: false });
  
  // Remove note reference from lead
  await Lead.findByIdAndUpdate(note.leadId, { 
    $pull: { notes: note._id },
    $set: { updatedAt: new Date() },
  });
  
  // Hard delete the note
  return Note.findByIdAndDelete(noteId);
};

/**
 * Get notes for a specific lead
 * @param {ObjectId} leadId
 * @param {Object} options - Query options
 * @param {boolean} [options.pinned] - Filter by pinned status
 * @param {string} [options.tag] - Filter by tag
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const getNotesByLeadId = async (leadId, options = {}) => {
  // Verify the lead exists
  const lead = await Lead.findById(leadId);
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }
  
  // Build filter
  const filter = { 
    leadId,
    is_deleted: false,
  };
  
  // Apply pinned filter
  if (options.pinned !== undefined) {
    filter.isPinned = options.pinned;
  }
  
  // Apply tag filter
  if (options.tag) {
    filter.tags = options.tag;
  }
  
  return queryNotes(filter, {
    ...options,
    populate: true,
  });
};

/**
 * Get notes created by a user
 * @param {ObjectId} userId
 * @param {Object} options - Query options
 * @param {boolean} [options.pinned] - Filter by pinned status
 * @param {string} [options.tag] - Filter by tag
 * @param {string} [options.leadId] - Filter by lead
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const getNotesByAuthor = async (userId, options = {}) => {
  // Verify the user exists
  const user = await User.findById(userId);
  if (!user || user.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  
  // Build filter
  const filter = { 
    createdBy: userId,
    is_deleted: false,
  };
  
  // Apply lead filter
  if (options.leadId) {
    filter.leadId = options.leadId;
  }
  
  // Apply pinned filter
  if (options.pinned !== undefined) {
    filter.isPinned = options.pinned;
  }
  
  // Apply tag filter
  if (options.tag) {
    filter.tags = options.tag;
  }
  
  return queryNotes(filter, {
    ...options,
    populate: true,
  });
};



module.exports = {
  createNote,
  queryNotes,
  getNoteById,
  updateNoteById,
  deleteNoteById,
  getNotesByLeadId,
  getNotesByAuthor,
};
