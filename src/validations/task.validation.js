const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createTask = {
  body: Joi.object().keys({
    title: Joi.string().required(),
    leadId: Joi.string().custom(objectId).required(),
    description: Joi.string(),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'on_hold', 'cancelled').default('pending'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    dueDate: Joi.date().iso().greater('now'),
    startDate: Joi.date().iso(),
    assignedTo: Joi.array().items(Joi.string().custom(objectId)),
    tags: Joi.array().items(Joi.string()),
    createdBy: Joi.string().custom(objectId).required(),
  }),
};

const getTasks = {
  query: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'on_hold', 'cancelled'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    assignedTo: Joi.string().custom(objectId),
    relatedTo: Joi.string().custom(objectId),
    relatedType: Joi.string().valid('lead', 'note', 'user'),
    dueDateFrom: Joi.date().iso(),
    dueDateTo: Joi.date().iso(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getTask = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
  }),
};

const updateTask = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string(),
      description: Joi.string(),
      status: Joi.string().valid('pending', 'in_progress', 'completed', 'on_hold', 'cancelled'),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
      dueDate: Joi.date().iso(),
      startDate: Joi.date().iso(),
      assignedTo: Joi.array().items(Joi.string().custom(objectId)),
      tags: Joi.array().items(Joi.string()),
      leadId: Joi.string().custom(objectId), 
      createdBy: Joi.string().custom(objectId).required(),
    })
    .min(1),
};

const deleteTask = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
  }),
};

const updateTaskStatus = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid('pending', 'in_progress', 'completed', 'on_hold', 'cancelled')
      .required(),
    comment: Joi.string(),
  }),
};

const assignTask = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    userIds: Joi.alternatives().try(
      Joi.string().custom(objectId),
      Joi.array().items(Joi.string().custom(objectId))
    ).required().description('User ID or array of user IDs to assign to the task'),
  }),
};

const addComment = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    content: Joi.string().required(),
    isInternal: Joi.boolean().default(false),
  }),
};

const getComments = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const updateComment = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
    commentId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      content: Joi.string().required(),
    })
    .min(1),
};

const deleteComment = {
  params: Joi.object().keys({
    taskId: Joi.string().custom(objectId).required(),
    commentId: Joi.string().required(),
  }),
};


module.exports = {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  assignTask,
  addComment,
  getComments,
  updateComment,
  deleteComment,
};
