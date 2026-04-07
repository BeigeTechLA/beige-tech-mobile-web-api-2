const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const billingController = require('../../controllers/billing.controller');

const router = express.Router();

// Routes for billing management
router
  .route('/')
  .get(billingController.getBillings);

router
  .route('/:billingId')
  .get(billingController.getBillingById);

router
  .route('/:billingId/invoice')
  .get(billingController.downloadInvoice);

router
  .route('/:billingId/download-invoice')
  .get(billingController.downloadProfessionalInvoice);

module.exports = router;
