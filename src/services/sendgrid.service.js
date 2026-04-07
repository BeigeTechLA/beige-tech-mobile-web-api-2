const sgMail = require('@sendgrid/mail');
const config = require('../config/config');
const logger = require('../config/logger');

// Initialize SendGrid
if (config.sendgrid.apiKey) {
  sgMail.setApiKey(config.sendgrid.apiKey);
} else {
  logger.warn('SendGrid API key not configured. Email sending will be disabled.');
}

/**
 * Send booking confirmation email to client
 * @param {Object} bookingData - Booking information
 * @param {Object} paymentData - Payment information
 * @returns {Promise<Object>} Result object with success status
 */
const sendBookingConfirmationEmail = async (bookingData, paymentData) => {
  try {
    if (!config.sendgrid.apiKey) {
      logger.warn('[SendGrid] API key not configured - skipping email send');
      return { success: false, error: 'SendGrid not configured' };
    }

    const { guestEmail, guestName } = bookingData;
    const { confirmationNumber, transactionId, amount, paymentMethod } = paymentData;

    const msg = {
      to: guestEmail,
      from: {
        email: 'noreply@beige.app', // Use verified domain
        name: 'Beige Corporation'
      },
      subject: `Booking Confirmed - ${confirmationNumber}`,
      templateId: 'd-booking-confirmation', // This will be set up in SendGrid dashboard
      dynamicTemplateData: {
        guestName,
        confirmationNumber,
        transactionId,
        amount: `$${amount.toFixed(2)}`,
        paymentMethod,
        paymentDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        // Booking details
        contentType: bookingData.contentType,
        shootType: bookingData.shootType,
        editType: bookingData.editType || 'Standard',
        durationHours: bookingData.durationHours,
        startDateTime: new Date(bookingData.startDateTime).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }),
        location: bookingData.location,
        shootName: bookingData.shootName || '',
        // Branding
        brandColor: '#000000',
        logoUrl: 'https://beigecorporation.io/logo.png'
      }
    };

    const response = await sgMail.send(msg);
    logger.info(`[SendGrid] Booking confirmation email sent to ${guestEmail}`);
    return { success: true, messageId: response[0].headers['x-message-id'] };

  } catch (error) {
    logger.error(`[SendGrid] Failed to send booking confirmation email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send ops notification email about new booking
 * @param {Object} bookingData - Booking information
 * @param {Object} paymentData - Payment information
 * @returns {Promise<Object>} Result object with success status
 */
const sendOpsNotificationEmail = async (bookingData, paymentData) => {
  try {
    if (!config.sendgrid.apiKey) {
      logger.warn('[SendGrid] API key not configured - skipping email send');
      return { success: false, error: 'SendGrid not configured' };
    }

    const { guestEmail, guestName, guestPhone } = bookingData;
    const { confirmationNumber, transactionId, amount } = paymentData;

    const msg = {
      to: 'info@beigecorporation.io',
      from: {
        email: 'noreply@beige.app', // Use verified domain
        name: 'Beige Booking System'
      },
      subject: `New Booking Alert - ${confirmationNumber}`,
      templateId: 'd-ops-notification', // This will be set up in SendGrid dashboard
      dynamicTemplateData: {
        confirmationNumber,
        transactionId,
        amount: `$${amount.toFixed(2)}`,
        paymentDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }),
        // Client details
        guestName,
        guestEmail,
        guestPhone,
        // Booking details
        contentType: bookingData.contentType,
        shootType: bookingData.shootType,
        editType: bookingData.editType || 'Standard',
        durationHours: bookingData.durationHours,
        startDateTime: new Date(bookingData.startDateTime).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }),
        location: bookingData.location,
        shootName: bookingData.shootName || 'Not specified',
        // Status and priority
        status: 'paid',
        priority: 'normal',
        urgency: bookingData.isRushOrder ? 'high' : 'normal'
      }
    };

    const response = await sgMail.send(msg);
    logger.info(`[SendGrid] Ops notification email sent for booking ${confirmationNumber}`);
    return { success: true, messageId: response[0].headers['x-message-id'] };

  } catch (error) {
    logger.error(`[SendGrid] Failed to send ops notification email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send email using HTML template (fallback method)
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.from] - Sender email (optional)
 * @returns {Promise<Object>} Result object with success status
 */
const sendHtmlEmail = async (options) => {
  try {
    if (!config.sendgrid.apiKey) {
      logger.warn('[SendGrid] API key not configured - skipping email send');
      return { success: false, error: 'SendGrid not configured' };
    }

    const { to, subject, html, from } = options;

    const msg = {
      to,
      from: from || {
        email: 'noreply@beige.app', // Use verified domain
        name: 'Beige Corporation'
      },
      subject,
      html
    };

    const response = await sgMail.send(msg);
    logger.info(`[SendGrid] HTML email sent to ${to}`);
    return { success: true, messageId: response[0].headers['x-message-id'] };

  } catch (error) {
    logger.error(`[SendGrid] Failed to send HTML email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send password reset email with reset link
 * @param {string} to - User's email
 * @param {string} token - Password reset token
 * @returns {Promise<Object>} Result object with success status
 */
const sendResetPasswordEmail = async (to, token) => {
  try {
    if (!config.sendgrid.apiKey) {
      logger.warn('[SendGrid] API key not configured - skipping email send');
      return { success: false, error: 'SendGrid not configured' };
    }

    const resetPasswordUrl = `${config.client.url}/Auth/reset_password/setnewpassword?token=${token}`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #000000;
          color: white;
          padding: 20px;
          text-align: center;
        }
        .content {
          background-color: #f9f9f9;
          padding: 30px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .reset-button {
          display: inline-block;
          background-color: #000000;
          color: white;
          padding: 15px 40px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
        }
        .reset-button:hover {
          background-color: #333333;
        }
        .footer {
          text-align: center;
          color: #666;
          font-size: 14px;
          margin-top: 30px;
        }
        .warning {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Reset Your Password</h1>
      </div>
      <div class="content">
        <p>Dear user,</p>
        <p>We received a request to reset your password for your Beige account.</p>

        <div class="button-container">
          <a href="${resetPasswordUrl}" class="reset-button">Reset Password</a>
        </div>

        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #0066cc;">${resetPasswordUrl}</p>

        <div class="warning">
          <p style="margin: 0;"><strong>⚠️ This link will expire in 10 minutes.</strong></p>
        </div>

        <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Beige Corporation. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    </body>
    </html>
    `;

    const msg = {
      to,
      from: {
        email: 'noreply@beige.app',
        name: 'Beige Corporation'
      },
      subject: 'Reset Your Password',
      html: htmlContent,
      // Disable click tracking to prevent SendGrid URL wrapping
      trackingSettings: {
        clickTracking: {
          enable: false,
          enableText: false
        },
        openTracking: {
          enable: false
        }
      }
    };

    const response = await sgMail.send(msg);
    logger.info(`[SendGrid] Password reset email sent to ${to}`);
    return { success: true, messageId: response[0].headers['x-message-id'] };

  } catch (error) {
    logger.error(`[SendGrid] Failed to send password reset email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send user credentials email
 * @param {string} to - User's email
 * @param {Object} userData - User information including email and name
 * @returns {Promise<Object>} Result object with success status
 */
const sendCredentialsEmail = async (to, userData) => {
  try {
    if (!config.sendgrid.apiKey) {
      logger.warn('[SendGrid] API key not configured - skipping email send');
      return { success: false, error: 'SendGrid not configured' };
    }

    const { email, name } = userData;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #000000;
          color: white;
          padding: 20px;
          text-align: center;
        }
        .content {
          background-color: #f9f9f9;
          padding: 30px;
          border-radius: 5px;
          margin: 20px 0;
        }
        .credentials {
          background-color: white;
          padding: 20px;
          border-left: 4px solid #000000;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          color: #666;
          font-size: 14px;
          margin-top: 30px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Your Beige Account Credentials</h1>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>We received a request to retrieve the credentials for your Beige account.</p>

        <div class="credentials">
          <h3>Your Account Details:</h3>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Name:</strong> ${name}</p>
        </div>

        <p><strong>Note:</strong> For security reasons, we do not store your password in a readable format. If you need to access your account and have forgotten your password, please use the password reset feature.</p>

        <p>If you did not request this information, please ignore this email or contact us if you have concerns about your account security.</p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Beige Corporation. All rights reserved.</p>
        <p>This is an automated message, please do not reply to this email.</p>
      </div>
    </body>
    </html>
    `;

    const msg = {
      to,
      from: {
        email: 'noreply@beige.app',
        name: 'Beige Corporation'
      },
      subject: 'Your Beige Account Credentials',
      html: htmlContent
    };

    const response = await sgMail.send(msg);
    logger.info(`[SendGrid] Credentials email sent to ${to}`);
    return { success: true, messageId: response[0].headers['x-message-id'] };

  } catch (error) {
    logger.error(`[SendGrid] Failed to send credentials email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Validate SendGrid configuration
 * @returns {Promise<boolean>} True if SendGrid is properly configured
 */
const validateConfiguration = async () => {
  try {
    if (!config.sendgrid.apiKey) {
      return false;
    }

    // Test API key by making a simple request
    const testMsg = {
      to: config.email.from, // Send to ourselves
      from: config.email.from,
      subject: 'SendGrid Configuration Test',
      text: 'This is a test message to validate SendGrid configuration.'
    };

    await sgMail.send(testMsg);
    logger.info('[SendGrid] Configuration validated successfully');
    return true;
  } catch (error) {
    logger.error(`[SendGrid] Configuration validation failed: ${error.message}`);
    return false;
  }
};

module.exports = {
  sendBookingConfirmationEmail,
  sendOpsNotificationEmail,
  sendHtmlEmail,
  sendResetPasswordEmail,
  sendCredentialsEmail,
  validateConfiguration
};