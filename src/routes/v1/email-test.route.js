const express = require('express');
const emailTestController = require('../../controllers/email-test.controller');

const router = express.Router();

/**
 * @route GET /v1/email-test/config
 * @desc Test email configuration
 * @access Public (for development/testing)
 */
router.get('/config', emailTestController.testEmailConfiguration);

/**
 * @route POST /v1/email-test/booking
 * @desc Send test booking emails (confirmation + ops notification)
 * @body { email: string }
 * @access Public (for development/testing)
 */
router.post('/booking', emailTestController.sendTestBookingEmail);

/**
 * @route POST /v1/email-test/confirmation
 * @desc Send test confirmation email only
 * @body { email: string }
 * @access Public (for development/testing)
 */
router.post('/confirmation', emailTestController.sendTestConfirmationEmail);

/**
 * @route POST /v1/email-test/ops
 * @desc Send test operations email to specified recipient
 * @body { email: string }
 * @access Public (for development/testing)
 */
router.post('/ops', emailTestController.sendTestOpsEmail);

/**
 * @route GET /v1/email-test/template/:template
 * @desc Preview email template in browser
 * @param template - Template name (booking-confirmation or ops-notification)
 * @access Public (for development/testing)
 */
router.get('/template/:template', emailTestController.getTemplatePreview);

module.exports = router;