const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createLead = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().email(),
    phone: Joi.string(),
    company: Joi.string(),
    source: Joi.string().valid('website', 'referral', 'social_media', 'email', 'phone', 'in_person', 'other'),
    status: Joi.string().valid('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'closed_won', 'closed_lost'),
    value: Joi.object().keys({
      amount: Joi.number().min(0),
      currency: Joi.string()
    }),
    lead_type: Joi.string().valid('individual', 'business', 'agency', 'other'),
    score: Joi.number().min(0),
    tags: Joi.array().items(Joi.string()),
    assigned_employees: Joi.array().items(Joi.string().custom(objectId)),
    last_contacted: Joi.date(),
    next_follow_up: Joi.date(),
    expected_close_date: Joi.date(),
    probability: Joi.number().min(0).max(100),
    lost_reason: Joi.string(),
    description: Joi.string(),
    notes: Joi.string(),
    customer_id: Joi.string().custom(objectId),
    order_id: Joi.string().custom(objectId),
    owner: Joi.string().custom(objectId),
  }),
};

const getLeads = {
  query: Joi.object().keys({
    status: Joi.string().allow('').optional(),
    source: Joi.string(),
    lead_type: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getLead = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
};

const updateLead = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      email: Joi.string().email(),
      phone: Joi.string(),
      company: Joi.string(),
      source: Joi.string().valid('website', 'referral', 'social_media', 'email', 'phone', 'in_person', 'other'),
      status: Joi.string().valid('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'closed_won', 'closed_lost'),
      value: Joi.object().keys({
        amount: Joi.number().min(0),
        currency: Joi.string()
      }),
      lead_type: Joi.string().valid('individual', 'business', 'agency', 'other'),
      score: Joi.number().min(0),
      tags: Joi.array().items(Joi.string()),
      assigned_employees: Joi.array().items(Joi.string().custom(objectId)),
      last_contacted: Joi.date(),
      next_follow_up: Joi.date(),
      expected_close_date: Joi.date(),
      probability: Joi.number().min(0).max(100),
      lost_reason: Joi.string(),
      description: Joi.string(),
      notes: Joi.string(),
      customer_id: Joi.string().custom(objectId),
      owner: Joi.string().custom(objectId),
    })
    .min(1),
};

const deleteLead = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
};

const updateLeadStatus = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'closed_won', 'closed_lost').required(),
    reason: Joi.string(),
  }),
};

const processOrderLead = {
  body: Joi.object().keys({
    order_id: Joi.string().custom(objectId).required(),
    tracking_point: Joi.string().valid("order_created", "Payment_page", "pament_failed", "order_completed", "order_cancelled", "other"),
  }),
};

const updateLeadBasicInfo = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    assigned_employees: Joi.array().items(Joi.string().custom(objectId)),
    company: Joi.object().keys({
      name: Joi.string().allow('', null),
      website: Joi.string().uri().allow('', null),
      size: Joi.string().valid('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001+').allow(null),
      industry: Joi.string().allow('', null),
    }),
    tags: Joi.array().items(Joi.string()),
  }).min(1),
};

module.exports = {
  createLead,
  getLeads,
  getLead,
  updateLead,
  deleteLead,
  updateLeadStatus,
  processOrderLead,
  updateLeadBasicInfo,
};
