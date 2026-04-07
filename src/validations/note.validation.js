const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createNote = {
  body: Joi.object().keys({
    content: Joi.string().required(),
    leadId: Joi.string().custom(objectId).required(),
    createdBy: Joi.string().custom(objectId).required(),
  }),
};

const getNotes = {
  query: Joi.object().keys({
    leadId: Joi.string().custom(objectId),
    createdBy: Joi.string().custom(objectId),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getNote = {
  params: Joi.object().keys({
    noteId: Joi.string().custom(objectId).required(),
  }),
};

const updateNote = {
  params: Joi.object().keys({
    noteId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      content: Joi.string(),
      leadId: Joi.string().custom(objectId),
    })
    .min(1),
};

const deleteNote = {
  params: Joi.object().keys({
    noteId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
};
