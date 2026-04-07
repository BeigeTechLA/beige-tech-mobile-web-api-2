const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createReviewRequest = {
  body: Joi.object().keys({
    cpId: Joi.string().required().custom(objectId),
    userId: Joi.string().required().custom(objectId),
    orderId: Joi.string().required().custom(objectId),
  }),
};

const getReviewRequestsByUser = {
  params: Joi.object().keys({
    userId: Joi.string().required().custom(objectId),
  }),
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getReviewRequestsByCp = {
  params: Joi.object().keys({
    cpId: Joi.string().required().custom(objectId),
  }),
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const respondToReviewRequest = {
  params: Joi.object().keys({
    id: Joi.string().required().custom(objectId),
  }),
  body: Joi.object().keys({
    status: Joi.string().required().valid('accepted', 'rejected'),
  }),
};

const getAllReviewRequests = {
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

module.exports = {
  createReviewRequest,
  getReviewRequestsByUser,
  getReviewRequestsByCp,
  respondToReviewRequest,
  getAllReviewRequests,
};
