const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createFAQ = {
  body: Joi.object().keys({
    question: Joi.string().required().trim().min(5).max(500),
    answer: Joi.string().required().trim().min(5).max(2000),
    type: Joi.string().valid('cp', 'admin').required(),
    status: Joi.string().valid('active', 'inactive').default('active'),
    isPublic: Joi.boolean().default(true),
    order: Joi.number().integer().min(0).default(0),
    category: Joi.string().trim().max(100),
    tags: Joi.array().items(Joi.string().trim().max(50)),
  }),
};

const getFAQs = {
  query: Joi.object().keys({
    type: Joi.string().valid('cp', 'admin'),
    status: Joi.string().valid('active', 'inactive'),
    isPublic: Joi.boolean(),
    category: Joi.string(),
    createdBy: Joi.string().custom(objectId),
    search: Joi.string().trim(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getFAQ = {
  params: Joi.object().keys({
    faqId: Joi.string().custom(objectId).required(),
  }),
};

const updateFAQ = {
  params: Joi.object().keys({
    faqId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      question: Joi.string().trim().min(5).max(500),
      answer: Joi.string().trim().min(5).max(2000),
      status: Joi.string().valid('active', 'inactive'),
      isPublic: Joi.boolean(),
      order: Joi.number().integer().min(0),
      category: Joi.string().trim().max(100),
      tags: Joi.array().items(Joi.string().trim().max(50)),
    })
    .min(1),
};

const deleteFAQ = {
  params: Joi.object().keys({
    faqId: Joi.string().custom(objectId).required(),
  }),
};

const getPublicFAQs = {
  query: Joi.object().keys({
    type: Joi.string().valid('cp', 'admin'),
    category: Joi.string(),
    search: Joi.string().trim(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getCPFAQs = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive'),
    category: Joi.string(),
    search: Joi.string().trim(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const createCPFAQ = {
  body: Joi.object().keys({
    question: Joi.string().required().trim().min(5).max(500),
    answer: Joi.string().required().trim().min(5).max(2000),
    status: Joi.string().valid('active', 'inactive').default('active'),
    isPublic: Joi.boolean().default(true),
    order: Joi.number().integer().min(0).default(0),
    category: Joi.string().trim().max(100),
    tags: Joi.array().items(Joi.string().trim().max(50)),
  }),
};

const createAdminFAQ = {
  body: Joi.object().keys({
    question: Joi.string().required().trim().min(5).max(500),
    answer: Joi.string().required().trim().min(5).max(2000),
    status: Joi.string().valid('active', 'inactive').default('active'),
    isPublic: Joi.boolean().default(true),
    order: Joi.number().integer().min(0).default(0),
    category: Joi.string().trim().max(100),
    tags: Joi.array().items(Joi.string().trim().max(50)),
  }),
};

const getAdminFAQs = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive'),
    category: Joi.string(),
    createdBy: Joi.string().custom(objectId),
    search: Joi.string().trim(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

module.exports = {
  createFAQ,
  getFAQs,
  getFAQ,
  updateFAQ,
  deleteFAQ,
  getPublicFAQs,
  getCPFAQs,
  getAdminFAQs,
  createCPFAQ,
  createAdminFAQ,
};
