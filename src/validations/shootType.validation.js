const Joi = require("joi");
const { objectId } = require("./custom.validation");

const createShootType = {
  body: Joi.object().keys({
    title: Joi.string().required().trim().min(1).max(100),
    description: Joi.string().trim().max(500).allow(""),
    status: Joi.string().valid("active", "inactive").default("active"),
    sortOrder: Joi.number().integer().min(0).default(0),
    createdBy: Joi.string().custom(objectId).required(),
  }),
};

const getShootTypes = {
  query: Joi.object().keys({
    title: Joi.string().trim(),
    status: Joi.string().valid("active", "inactive"),
    search: Joi.string().trim(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getShootType = {
  params: Joi.object().keys({
    shootTypeId: Joi.string().custom(objectId).required(),
  }),
};

const getShootTypeBySlug = {
  params: Joi.object().keys({
    slug: Joi.string().required(),
  }),
};

const updateShootType = {
  params: Joi.object().keys({
    shootTypeId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string().trim().min(1).max(100),
      description: Joi.string().trim().max(500).allow(""),
      status: Joi.string().valid("active", "inactive"),
      sortOrder: Joi.number().integer().min(0),
      updatedBy: Joi.string().custom(objectId).required(),
    })
    .min(1),
};

const deleteShootType = {
  params: Joi.object().keys({
    shootTypeId: Joi.string().custom(objectId).required(),
  }),
};

// Public API validations (no authentication required)
const getPublicShootTypes = {
  query: Joi.object().keys({
    status: Joi.string().valid("active", "inactive").default("active"),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    sortBy: Joi.string().default("sortOrder:asc"),
  }),
};

const getPublicShootTypeBySlug = {
  params: Joi.object().keys({
    slug: Joi.string().required(),
  }),
};

module.exports = {
  createShootType,
  getShootTypes,
  getShootType,
  getShootTypeBySlug,
  updateShootType,
  deleteShootType,
  getPublicShootTypes,
  getPublicShootTypeBySlug,
};
