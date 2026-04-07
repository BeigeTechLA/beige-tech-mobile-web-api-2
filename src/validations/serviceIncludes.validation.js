const Joi = require("joi");
const { objectId } = require("./custom.validation");

const createServiceIncludes = {
  body: Joi.object().keys({
    cpId: Joi.string().custom(objectId).required(),
    title: Joi.array()
      .items(Joi.string().trim().min(1).max(200).required())
      .min(1)
      .max(50)
      .required(),
  }),
};

const getServiceIncludes = {
  query: Joi.object().keys({
    cpId: Joi.string().custom(objectId),
    status: Joi.string().valid("active", "inactive"),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getServiceInclude = {
  params: Joi.object().keys({
    serviceId: Joi.string().custom(objectId).required(),
  }),
};

const updateServiceInclude = {
  params: Joi.object().keys({
    serviceId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string().trim().min(1).max(200),
      status: Joi.string().valid("active", "inactive"),
    })
    .min(1),
};

const deleteServiceInclude = {
  params: Joi.object().keys({
    serviceId: Joi.string().custom(objectId).required(),
  }),
};

const getServiceIncludesByCpId = {
  params: Joi.object().keys({
    cpId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    status: Joi.string().valid("active", "inactive").default("active"),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

module.exports = {
  createServiceIncludes,
  getServiceIncludes,
  getServiceInclude,
  updateServiceInclude,
  deleteServiceInclude,
  getServiceIncludesByCpId,
};
