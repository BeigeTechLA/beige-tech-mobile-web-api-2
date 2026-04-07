const express = require('express');
const validate = require('../../middlewares/validate');
const { leadValidation } = require('../../validations');
const { leadController } = require('../../controllers');

const router = express.Router();

// Lead Routes
router
  .route('/')
  .post(validate(leadValidation.createLead), leadController.createLead)
  .get(validate(leadValidation.getLeads), leadController.getLeads);

router
  .route('/:leadId')
  .get(validate(leadValidation.getLead), leadController.getLead)
  .patch(validate(leadValidation.updateLead), leadController.updateLead)
  .delete(validate(leadValidation.deleteLead), leadController.deleteLead);

// Lead Status Updates
router.post(
  '/:leadId/status',
  validate(leadValidation.updateLeadStatus),
  leadController.updateLeadStatus
);

// Update lead basic info (assigned employees, company info, tags)
router.put(
  '/:leadId/basic-info',
  validate(leadValidation.updateLeadBasicInfo),
  leadController.updateLeadBasicInfo
);

// Process order to create or update lead
router.post(
  '/from-order',
  validate(leadValidation.processOrderLead),
  leadController.processOrderLead
);

module.exports = router; 