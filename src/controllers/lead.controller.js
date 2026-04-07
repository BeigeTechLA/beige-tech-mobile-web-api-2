// src/controllers/lead.controller.js
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { leadService } = require('../services');

const createLead = catchAsync(async (req, res) => {
  const lead = await leadService.createLead(req.body);
  res.status(httpStatus.CREATED).send(lead);
});

const getLeads = catchAsync(async (req, res) => {
  const result = await leadService.queryLeads(req.query);
  res.send(result);
});

const getLead = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadById(req.params.leadId);
  res.send(lead);
});

const updateLead = catchAsync(async (req, res) => {
  const lead = await leadService.updateLeadById(req.params.leadId, req.body);
  res.send(lead);
});

const deleteLead = catchAsync(async (req, res) => {
  await leadService.deleteLeadById(req.params.leadId);
  res.status(httpStatus.NO_CONTENT).send();
});

const updateLeadStatus = catchAsync(async (req, res) => {
  const lead = await leadService.updateLeadStatus(req.params.leadId, req.body.status);
  res.send(lead);
});

/**
 * Process an order to create or update a lead
 * @route POST /leads/from-order
 */
const processOrderLead = catchAsync(async (req, res) => {
  const { order_id, tracking_point } = req.body;
  
  if (!order_id) {
    res.status(httpStatus.BAD_REQUEST).send({ message: 'order_id is required' });
    return;
  }
  
  const lead = await leadService.createOrUpdateLeadFromOrder(order_id, { tracking_point });
  res.send(lead);
});

/**
 * Update lead basic information (assigned employees, company information, and tags)
 * @route PUT /leads/:leadId/basic-info
 */
const updateLeadBasicInfo = catchAsync(async (req, res) => {
  const lead = await leadService.updateLeadBasicInfo(req.params.leadId, req.body);
  res.send(lead);
});

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