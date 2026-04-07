const express = require('express');
const validate = require('../../middlewares/validate');
const { quotationValidation } = require('../../validations');
const { quotationController } = require('../../controllers');

const router = express.Router();

/**
 * @api {post} /v1/quotations Create a new quotation and send payment link
 * @apiDescription Create a new quotation with flat or percentage discount, mark it as accepted, and send payment link if order exists
 * @apiVersion 1.0.0
 * @apiName CreateQuotation
 * @apiGroup Quotation
 * @apiPermission admin
 */
router.post(
  '/',
  validate(quotationValidation.createQuotation),
  quotationController.createQuotation
);

/**
 * @api {get} /v1/quotations Get all quotations by lead ID
 * @apiDescription Get all quotations related to a specific lead ID
 * @apiVersion 1.0.0
 * @apiName GetQuotationsByLeadId
 * @apiGroup Quotation
 * @apiPermission admin
 */
router.get(
  '/',
  validate(quotationValidation.getQuotationsByLeadId),
  quotationController.getQuotationsByLeadId
);

/**
 * @api {get} /v1/quotations/:quotationId Get quotation by ID
 * @apiDescription Get a specific quotation by its ID
 * @apiVersion 1.0.0
 * @apiName GetQuotation
 * @apiGroup Quotation
 * @apiPermission admin
 */
router.get(
  '/:quotationId',
  validate(quotationValidation.getQuotation),
  quotationController.getQuotation
);

/**
 * @api {get} /v1/quotations/response/:encryptedId/:action Handle offer response
 * @apiDescription Handle client's response to a quotation offer (accept/reject)
 * @apiVersion 1.0.0
 * @apiName HandleOfferResponse
 * @apiGroup Quotation
 * @apiPermission public
 */
router.get(
  '/response/:encryptedId/:action',
  validate(quotationValidation.handleOfferResponse),
  quotationController.handleOfferResponse
);

/**
 * @api {post} /v1/quotations/:quotationId/payment-link Send payment link manually
 * @apiDescription Send payment link to client manually based on quotation ID
 * @apiVersion 1.0.0
 * @apiName SendPaymentLink
 * @apiGroup Quotation
 * @apiPermission admin
 */
router.post(
  '/:quotationId/payment-link',
  validate(quotationValidation.sendPaymentLink),
  quotationController.sendPaymentLink
);

module.exports = router;
