const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { quotationService } = require('../services');

/**
 * Create a quotation, mark it as accepted, and send payment link if order exists
 * @route POST /v1/quotations
 */
const createQuotation = catchAsync(async (req, res) => {
  const quotation = await quotationService.createQuotation(req.body);
  res.status(httpStatus.CREATED).send(quotation);
});

/**
 * Get all quotations by lead ID
 * @route GET /v1/quotations
 */
const getQuotationsByLeadId = catchAsync(async (req, res) => {
  const quotations = await quotationService.getQuotationsByLeadId(req.query.leadId);
  res.send(quotations);
});

/**
 * Get quotation by ID
 * @route GET /v1/quotations/:quotationId
 */
const getQuotation = catchAsync(async (req, res) => {
  const quotation = await quotationService.getQuotationById(req.params.quotationId);
  res.send(quotation);
});

/**
 * Handle offer response (accept/reject)
 * @route GET /v1/quotations/respond/:encryptedId/:action
 */
const handleOfferResponse = catchAsync(async (req, res) => {
  const { encryptedId, action } = req.params;
  const result = await quotationService.handleOfferResponse(encryptedId, action);
  res.send(result);
});

/**
 * Send payment link manually
 * @route POST /v1/quotations/:quotationId/payment-link
 */
const sendPaymentLink = catchAsync(async (req, res) => {
  await quotationService.sendPaymentLink(req.params.quotationId);
  res.status(httpStatus.OK).send({ message: 'Payment link sent successfully' });
});

module.exports = {
  createQuotation,
  getQuotationsByLeadId,
  getQuotation,
  handleOfferResponse,
  sendPaymentLink,
};
