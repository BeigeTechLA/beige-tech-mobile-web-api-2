// src/controllers/task.controller.js
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { taskService } = require('../services');

const createTask = catchAsync(async (req, res) => {
  const task = await taskService.createTask(req.body);
  res.status(httpStatus.CREATED).send(task);
});

const getTasks = catchAsync(async (req, res) => {
  // Create filter object with only defined values
  const filter = {};
  
  // Required leadId parameter
  if (req.query.leadId) {
    filter.leadId = req.query.leadId;
  }
  
  // Optional filters
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.tags) {
    // Handle tags as either a single tag or array of tags
    filter.tags = Array.isArray(req.query.tags) ? { $in: req.query.tags } : req.query.tags;
  }
  
  const options = {
    sortBy: req.query.sortBy,
    limit: req.query.limit,
    page: req.query.page,
  };
  
  const result = await taskService.queryTasks(filter, options);
  res.send(result);
});

const getTask = catchAsync(async (req, res) => {
  const task = await taskService.getTaskById(req.params.taskId);
  res.send(task);
});

const updateTask = catchAsync(async (req, res) => {
  const task = await taskService.updateTaskById(
    req.params.taskId,
    req.body
  );
  res.send(task);
});

const deleteTask = catchAsync(async (req, res) => {
  const task = await taskService.deleteTaskById(req.params.taskId);
  res.status(httpStatus.OK).json({
    message: 'Task deleted successfully',
    taskId: task._id,
  });
});

const updateTaskStatus = catchAsync(async (req, res) => {
  const task = await taskService.updateTaskStatus(
    req.params.taskId,
    req.body.status,
  );
  res.send(task);
});

/**
 * Assign users to a task
 * @route POST /tasks/:taskId/assign
 */
const assignTask = catchAsync(async (req, res) => {
  // Handle both single userId and array of userIds
  const userIds = Array.isArray(req.body.userIds) 
    ? req.body.userIds 
    : [req.body.userIds];
  
  const task = await taskService.assignUsersToTask(
    req.params.taskId,
    userIds
  );
  res.send(task);
});

/**
 * Remove users from a task
 * @route POST /tasks/:taskId/unassign
 */
const removeTaskAssignees = catchAsync(async (req, res) => {
  // Handle both single userId and array of userIds
  const userIds = Array.isArray(req.body.userIds) 
    ? req.body.userIds 
    : [req.body.userIds];
  
  const task = await taskService.removeUsersFromTask(
    req.params.taskId,
    userIds
  );
  res.send(task);
});

module.exports = {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  assignTask,
  removeTaskAssignees,
};