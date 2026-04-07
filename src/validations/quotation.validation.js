const Joi = require('joi');
const { objectId } = require('./custom.validation');

/**
 * Validation schema for creating a quotation
 */
const createQuotation = {
  body: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
    orderId: Joi.string().custom(objectId),
    order_title: Joi.string().when('orderId', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    original_price: Joi.number().min(0).when('orderId', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    discount_type: Joi.string().valid('flat', 'percentage', 'none').default('none'),
    discount_value: Joi.number().min(0).when('discount_type', {
      is: Joi.valid('flat', 'percentage'),
      then: Joi.required(),
      otherwise: Joi.optional().default(0),
    }),
    currency: Joi.string().default('USD'),
    notes: Joi.string().allow('', null),
    expiry_date: Joi.date().greater('now'),
    created_by: Joi.string().custom(objectId).required(),
  }),
};

/**
 * Validation schema for getting quotations by lead ID
 */
const getQuotationsByLeadId = {
  query: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
};

/**
 * Validation schema for getting a quotation by ID
 */
const getQuotation = {
  params: Joi.object().keys({
    quotationId: Joi.string().custom(objectId).required(),
  }),
};

/**
 * Validation schema for handling offer response
 */
const handleOfferResponse = {
  params: Joi.object().keys({
    encryptedId: Joi.string().required(),
    action: Joi.string().valid('accept', 'reject').required(),
  }),
};

/**
 * Validation schema for sending payment link
 */
const sendPaymentLink = {
  params: Joi.object().keys({
    quotationId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createQuotation,
  getQuotationsByLeadId,
  getQuotation,
  handleOfferResponse,
  sendPaymentLink,
};
