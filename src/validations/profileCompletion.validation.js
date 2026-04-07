const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getProfileCompletionStatus = {
  params: Joi.object().keys({
    cpId: Joi.string().required().custom(objectId),
  }),
};

const getBulkProfileCompletionStatus = {
  body: Joi.object().keys({
    cpIds: Joi.array().items(Joi.string().custom(objectId)).min(1).required(),
  }),
};

module.exports = {
  getProfileCompletionStatus,
  getBulkProfileCompletionStatus,
};
