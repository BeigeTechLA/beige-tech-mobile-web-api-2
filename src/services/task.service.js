const httpStatus = require('http-status');
const { Task, Lead, User } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a task
 * @param {Object} taskBody
 * @returns {Promise<Task>}
 */
const createTask = async (taskBody) => {
  // Verify the lead exists
  const lead = await Lead.findById(taskBody.leadId);
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }
  
  // Set default status if not provided
  if (!taskBody.status) {
    taskBody.status = 'pending';
  }
  
  // Create the task
  const task = await Task.create(taskBody);
  
  // Add task reference to lead
  await Lead.findByIdAndUpdate(task.leadId, { $push: { tasks: task._id } });
  
  // Return populated task
  return getTaskById(task._id);
};

/**
 * Query for tasks with pagination and filtering
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {boolean} [options.populate] - Whether to populate references (default = true)
 * @returns {Promise<QueryResult>}
 */
const queryTasks = async (filter, options = {}) => {
  // Apply pagination
  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // Build sort object
  let sortObj = {};
  if (options.sortBy) {
    const [field, order] = options.sortBy.split(':');
    sortObj[field] = order === 'desc' ? -1 : 1;
  } else {
    sortObj = { createdAt: -1 }; // Default sort by creation date, newest first
  }

  // Clean up filter object - remove undefined/null values
  Object.keys(filter).forEach(key => {
    if (filter[key] === undefined || filter[key] === null) {
      delete filter[key];
    }
  });

  const countPromise = Task.countDocuments(filter);
  const tasksQuery = Task.find(filter).sort(sortObj).skip(skip).limit(limit);

  if (options.populate !== false) {
    tasksQuery.populate([
      { path: 'leadId', select: 'status contact.name company.name' },
      { path: 'assignedTo', select: 'name email profile_picture' },
      { path: 'createdBy', select: 'name email profile_picture' },
    ]);
  }

  const [totalResults, results] = await Promise.all([countPromise, tasksQuery.exec()]);
  const totalPages = Math.ceil(totalResults / limit) || 1;

  return {
    results,
    page,
    limit,
    totalPages,
    totalResults,
  };
};

/**
 * Get task by id
 * @param {ObjectId} id
 * @param {Object} options - Query options
 * @param {boolean} [options.populate] - Whether to populate references (default = true)
 * @returns {Promise<Task>}
 */
const getTaskById = async (id, options = { populate: true }) => {
  const query = Task.findById(id);
  
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
      { path: 'assignedTo', select: 'name email profile_picture' },
      { path: 'createdBy', select: 'name email profile_picture' },
    ]);
  }
  
  const task = await query;
  
  if (!task) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  }
  
  return task;
};

/**
 * Update task by id
 * @param {ObjectId} taskId
 * @param {Object} updateBody
 * @returns {Promise<Task>}
 */
const updateTaskById = async (taskId, updateBody) => {
  const task = await getTaskById(taskId, { populate: false });
  
  // Handle status changes
  if (updateBody.status && updateBody.status !== task.status) {
    // If marking as completed, set completedAt
    if (updateBody.status === 'completed' && task.status !== 'completed') {
      updateBody.completedAt = new Date();
    } 
    // If changing from completed to another status, clear completedAt
    else if (task.status === 'completed' && updateBody.status !== 'completed') {
      updateBody.completedAt = null;
    }
    
    // Add to activity log
    updateBody.$push = {
      ...updateBody.$push,
      activity: {
        type: 'status_change',
        from: task.status,
        to: updateBody.status,
        changedAt: new Date(),
      },
    };
  }
  
  // Handle assignee changes
  if (updateBody.assignedTo) {
    // Verify assigned users exist
    const users = await User.find({
      _id: { $in: updateBody.assignedTo },
      is_deleted: false,
    }).select('_id');
    
    if (users.length !== updateBody.assignedTo.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'One or more assigned users not found');
    }
    
    // Add to activity log for assignment changes
    const addedAssignees = updateBody.assignedTo.filter(
      id => !task.assignedTo.some(a => a.toString() === id.toString())
    );
    
    const removedAssignees = task.assignedTo.filter(
      id => !updateBody.assignedTo.some(a => a.toString() === id.toString())
    );
    
    if (addedAssignees.length > 0 || removedAssignees.length > 0) {
      updateBody.$push = {
        ...updateBody.$push,
        activity: {
          type: 'assignment_change',
          added: addedAssignees,
          removed: removedAssignees,
          changedAt: new Date(),
        },
      };
    }
  }
  
  Object.assign(task, updateBody);
  await task.save();
  
  return getTaskById(taskId);
};

/**
 * Delete task by id (soft delete)
 * @param {ObjectId} taskId
 * @returns {Promise<Task>}
 */
const deleteTaskById = async (taskId) => {
  const task = await getTaskById(taskId, { populate: false });
  
  if (task.is_deleted) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Task already deleted');
  }

  if (!task) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  }

  await task.deleteOne(); // Permanently deletes the task
  return task;
};

/**
 * Get tasks for a specific lead
 * @param {ObjectId} leadId
 * @param {Object} options - Query options
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.assignedTo] - Filter by assignee
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const getTasksByLeadId = async (leadId, options = {}) => {
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
  
  // Apply status filter
  if (options.status) {
    filter.status = options.status;
  }
  
  // Apply assignee filter
  if (options.assignedTo) {
    filter.assignedTo = options.assignedTo;
  }
  
  return queryTasks(filter, {
    ...options,
    populate: true,
  });
};

/**
 * Get tasks assigned to a user
 * @param {ObjectId} userId
 * @param {Object} options - Query options
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.leadId] - Filter by lead
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const getTasksByAssignee = async (userId, options = {}) => {
  // Verify the user exists
  const user = await User.findById(userId);
  if (!user || user.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  
  // Build filter
  const filter = { 
    assignedTo: userId,
    is_deleted: false,
  };
  
  // Apply status filter
  if (options.status) {
    filter.status = options.status;
  }
  
  // Apply lead filter
  if (options.leadId) {
    filter.leadId = options.leadId;
  }
  
  return queryTasks(filter, {
    ...options,
    populate: true,
  });
};

/**
 * Get task statistics for a lead
 * @param {ObjectId} leadId
 * @returns {Promise<Object>} Statistics object
 */
const getTaskStatsByLeadId = async (leadId) => {
  // Verify the lead exists
  const lead = await Lead.findById(leadId);
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }
  
  const stats = await Task.aggregate([
    {
      $match: {
        leadId: lead._id,
        is_deleted: false,
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
  
  // Calculate totals
  const total = stats.reduce((sum, item) => sum + item.count, 0);
  
  // Format the response
  const result = {
    byStatus: {},
    total,
  };
  
  stats.forEach(stat => {
    result.byStatus[stat._id] = {
      count: stat.count,
      percentage: total > 0 ? Math.round((stat.count / total) * 100) : 0,
    };
  });
  
  return result;
};

/**
 * Update task status
 * @param {ObjectId} taskId
 * @param {string} status - New status
 * @param {Object} options - Additional options
 * @param {string} [options.updatedBy] - ID of the user updating the status
 * @returns {Promise<Task>}
 */
const updateTaskStatus = async (taskId, status, options = {}) => {
  const task = await getTaskById(taskId, { populate: false });
  
  // Validate status
  const validStatuses = ['pending', 'in_progress', 'completed', 'on_hold', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status');
  }
  
  // Don't update if status hasn't changed
  if (status === task.status) {
    return getTaskById(taskId);
  }
  
  // Handle status-specific logic
  const updateData = { status };
  
  // If marking as completed, set completedAt
  if (status === 'completed' && task.status !== 'completed') {
    updateData.completedAt = new Date();
  } 
  // If changing from completed to another status, clear completedAt
  else if (task.status === 'completed' && status !== 'completed') {
    updateData.completedAt = null;
  }
  
  // Add to activity log
  updateData.$push = {
    activity: {
      type: 'status_change',
      from: task.status,
      to: status,
      changedAt: new Date(),
      changedBy: options.updatedBy || null,
    },
  };
  
  const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true });
  
  return getTaskById(updatedTask._id);
};

/**
 * Assign users to a task
 * @param {ObjectId} taskId
 * @param {Array<ObjectId>} userIds - Array of user IDs to assign
 * @param {Object} options - Additional options
 * @param {string} options.assignedBy - ID of the user performing the assignment
 * @returns {Promise<Task>}
 */
const assignUsersToTask = async (taskId, userIds, options = {}) => {
  const task = await getTaskById(taskId, { populate: false });
  
  // Verify users exist
  const users = await User.find({
    _id: { $in: userIds },
  }).select('_id');
  
  if (users.length !== userIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'One or more users not found');
  }
  
  // Get current and new assignees
  const currentAssignees = task.assignedTo.map(id => id.toString());
  const newAssignees = userIds.filter(id => !currentAssignees.includes(id.toString()));
  
  // If no new assignees, return the task as is
  if (newAssignees.length === 0) {
    return getTaskById(taskId);
  }
  
  // Add new assignees
  task.assignedTo.push(...newAssignees);
  
  // Add to activity log
  task.activity = task.activity || [];
  task.activity.push({
    type: 'assignment_change',
    added: newAssignees,
    removed: [],
    changedAt: new Date(),
  });
  
  await task.save();
  
  return getTaskById(taskId);
};

/**
 * Remove users from a task
 * @param {ObjectId} taskId
 * @param {Array<ObjectId>} userIds - Array of user IDs to remove
 * @returns {Promise<Task>}
 */
const removeUsersFromTask = async (taskId, userIds) => {
  const task = await getTaskById(taskId, { populate: false });
  
  // Convert to strings for comparison
  const userIdsToRemove = userIds.map(id => id.toString());
  
  // Filter out users to be removed
  const originalCount = task.assignedTo.length;
  task.assignedTo = task.assignedTo.filter(
    id => !userIdsToRemove.includes(id.toString())
  );
  
  // If no users were removed, return the task as is
  if (task.assignedTo.length === originalCount) {
    return getTaskById(taskId);
  }
  
  // Add to activity log
  task.activity = task.activity || [];
  task.activity.push({
    type: 'assignment_change',
    added: [],
    removed: userIds,
    changedAt: new Date(),
  });
  
  await task.save();
  
  return getTaskById(taskId);
};

/**
 * Assign a single user to a task
 * @param {ObjectId} taskId
 * @param {ObjectId} userId - User ID to assign
 * @returns {Promise<Task>}
 */
const assignTask = async (taskId, userId) => {
  // Validate user exists
  const user = await User.findOne({ _id: userId, is_deleted: false });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  
  // Use the existing assignUsersToTask method with a single userId
  return assignUsersToTask(taskId, [userId], { assignedBy: userId });
};

module.exports = {
  createTask,
  queryTasks,
  getTaskById,
  updateTaskById,
  deleteTaskById,
  getTasksByLeadId,
  getTasksByAssignee,
  getTaskStatsByLeadId,
  updateTaskStatus,
  assignUsersToTask,
  removeUsersFromTask,
  assignTask,
};
