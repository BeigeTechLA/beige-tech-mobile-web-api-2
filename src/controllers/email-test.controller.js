const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { emailEnhancedService, sendgridService } = require('../services');

/**
 * Test email configuration
 */
const testEmailConfiguration = catchAsync(async (req, res) => {
  const result = await emailEnhancedService.testEmailConfiguration();
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Email configuration test completed',
    data: result
  });
});

/**
 * Send test booking confirmation email
 */
const sendTestBookingEmail = catchAsync(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Email address is required'
    });
  }

  // Test booking data
  const testBookingData = {
    guestName: 'Test Client',
    guestEmail: email,
    guestPhone: '(555) 123-4567',
    contentType: 'Photography & Videography',
    shootType: 'Product Photography',
    editType: 'Professional Editing',
    durationHours: 3,
    startDateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    location: 'Downtown Studio, 123 Main St, New York, NY',
    shootName: 'Test Campaign'
  };

  const testPaymentData = {
    confirmationNumber: 'BRG-TEST-001',
    transactionId: 'pi_test_1234567890',
    amount: 590.00,
    paymentMethod: 'Card ending in ****4242'
  };

  const result = await emailEnhancedService.sendBookingEmails(testBookingData, testPaymentData);
  
  res.status(httpStatus.OK).json({
    success: result.success,
    message: result.message,
    data: result.results
  });
});

/**
 * Send test confirmation email only
 */
const sendTestConfirmationEmail = catchAsync(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Email address is required'
    });
  }

  const testBookingData = {
    guestName: 'Test Client',
    guestEmail: email,
    contentType: 'Photography',
    shootType: 'Portrait',
    editType: 'Standard',
    durationHours: 2,
    startDateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    location: 'Studio A',
    shootName: 'Test Session'
  };

  const testPaymentData = {
    confirmationNumber: 'BRG-TEST-002',
    transactionId: 'pi_test_confirmation',
    amount: 340.00,
    paymentMethod: 'Card ending in ****4242'
  };

  const result = await emailEnhancedService.sendBookingConfirmationEmail(testBookingData, testPaymentData);
  
  res.status(httpStatus.OK).json({
    success: result.success,
    message: result.success ? 'Confirmation email sent successfully' : 'Failed to send confirmation email',
    error: result.error
  });
});

/**
 * Send test operations email to specified recipient
 */
const sendTestOpsEmail = catchAsync(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Email address is required'
    });
  }

  const testBookingData = {
    guestName: 'Test Client (Operations)',
    guestEmail: 'client@example.com',
    guestPhone: '(555) 987-6543',
    contentType: 'Photography & Videography',
    shootType: 'Corporate Event',
    editType: 'Premium Editing',
    durationHours: 4,
    startDateTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    location: 'Corporate Headquarters, 456 Business Ave, NYC',
    shootName: 'Annual Company Meeting'
  };

  const testPaymentData = {
    confirmationNumber: 'BRG-OPS-TEST-001',
    transactionId: 'pi_ops_test_abcdef123',
    amount: 740.00,
    paymentMethod: 'Card ending in ****4242'
  };

  const testBookingId = 'TEST_BOOKING_ID_67890abcdef';

  // Temporarily override the sendgrid service to send to test email
  const { emailEnhancedService } = require('../services');
  
  // Create a custom ops email that goes to the specified email
  try {
    const templateData = {
      confirmationNumber: testPaymentData.confirmationNumber,
      transactionId: testPaymentData.transactionId,
      amount: `$${testPaymentData.amount.toFixed(2)}`,
      paymentDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }),
      bookingId: testBookingId,
      guestName: testBookingData.guestName,
      guestEmail: testBookingData.guestEmail,
      guestPhone: testBookingData.guestPhone,
      contentType: testBookingData.contentType,
      shootType: testBookingData.shootType,
      editType: testBookingData.editType,
      durationHours: testBookingData.durationHours,
      startDateTime: new Date(testBookingData.startDateTime).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }),
      location: testBookingData.location,
      shootName: testBookingData.shootName,
      status: 'paid',
      priority: 'normal',
      urgency: 'normal'
    };

    const htmlContent = await emailEnhancedService.loadTemplate('ops-notification', templateData);
    
    const { sendgridService } = require('../services');
    const result = await sendgridService.sendHtmlEmail({
      to: email,
      subject: `[TEST] New Booking Alert - ${testPaymentData.confirmationNumber}`,
      html: htmlContent
    });

    res.status(httpStatus.OK).json({
      success: result.success,
      message: result.success ? 'Operations test email sent successfully' : 'Failed to send operations test email',
      error: result.error,
      data: {
        recipient: email,
        confirmationNumber: testPaymentData.confirmationNumber,
        bookingId: testBookingId
      }
    });

  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to send operations test email',
      error: error.message
    });
  }
});

/**
 * Get email template preview
 */
const getTemplatePreview = catchAsync(async (req, res) => {
  const { template } = req.params;
  
  const testData = {
    guestName: 'John Doe',
    confirmationNumber: 'BRG-PREVIEW-001',
    transactionId: 'pi_preview_123',
    amount: '$340.00',
    paymentMethod: 'Card ending in ****4242',
    paymentDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    contentType: 'Photography',
    shootType: 'Portrait',
    editType: 'Professional',
    durationHours: 2,
    startDateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }),
    location: 'Downtown Studio, 123 Main St',
    shootName: 'Portfolio Session',
    guestEmail: 'client@example.com',
    guestPhone: '(555) 123-4567'
  };

  try {
    const htmlContent = await emailEnhancedService.loadTemplate(template, testData);
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: `Template '${template}' not found`,
      error: error.message
    });
  }
});

module.exports = {
  testEmailConfiguration,
  sendTestBookingEmail,
  sendTestConfirmationEmail,
  sendTestOpsEmail,
  getTemplatePreview
};