const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getBookingsByStatus = {
  query: Joi.object().keys({
    status: Joi.string().valid('paid', 'assigned', 'completed').default('paid'),
    limit: Joi.number().integer().min(1).max(1000).default(100),
  }),
};

const getBookingById = {
  params: Joi.object().keys({
    airtableId: Joi.string().required(),
  }),
};

const updateBookingStatus = {
  params: Joi.object().keys({
    airtableId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('paid', 'assigned', 'completed'),
    assignedPhotographer: Joi.string(),
    notes: Joi.string().allow(''),
  }),
};

const assignPhotographer = {
  params: Joi.object().keys({
    airtableId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      photographerId: Joi.string().required(),
      photographerName: Joi.string().required(),
      notes: Joi.string().allow(''),
    })
    .required(),
};

const completeBooking = {
  params: Joi.object().keys({
    airtableId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    completionNotes: Joi.string().allow(''),
    deliveryDate: Joi.date().iso(),
  }),
};

module.exports = {
  getBookingsByStatus,
  getBookingById,
  updateBookingStatus,
  assignPhotographer,
  completeBooking,
};