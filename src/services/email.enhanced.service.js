const fs = require("fs").promises;
const path = require("path");
const config = require("../config/config");
const logger = require("../config/logger");
const sendgridService = require("./sendgrid.service");

/**
 * Load and process HTML email template
 * @param {string} templateName - Name of the template file (without .html extension)
 * @param {Object} templateData - Data to replace in template
 * @returns {Promise<string>} Processed HTML content
 */
const loadTemplate = async (templateName, templateData) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../templates/emails",
      `${templateName}.html`
    );
    let htmlContent = await fs.readFile(templatePath, "utf8");

    // Simple template replacement using double curly braces {{variable}}
    Object.keys(templateData).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      htmlContent = htmlContent.replace(regex, templateData[key] || "");
    });

    // Handle conditional blocks {{#if variable}} content {{/if}}
    htmlContent = htmlContent.replace(
      /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g,
      (match, varName, content) => {
        return templateData[varName] ? content : "";
      }
    );

    // Clean up any remaining template variables
    htmlContent = htmlContent.replace(/{{[^}]*}}/g, "");

    return htmlContent;
  } catch (error) {
    logger.error(`Failed to load template ${templateName}: ${error.message}`);
    throw new Error(`Template loading failed: ${error.message}`);
  }
};

/**
 * Send booking confirmation email to client
 * @param {Object} bookingData - Booking information from form
 * @param {Object} paymentData - Payment information from Stripe
 * @returns {Promise<Object>} Result object with success status
 */
const sendBookingConfirmationEmail = async (bookingData, paymentData) => {
  try {
    const { guestEmail, guestName } = bookingData;
    const { confirmationNumber, transactionId, amount, paymentMethod } =
      paymentData;

    const templateData = {
      guestName,
      confirmationNumber,
      transactionId,
      amount: `$${amount.toFixed(2)}`,
      paymentMethod: paymentMethod || "Card ending in ****4242",
      paymentDate: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      // Booking details from form
      contentType: bookingData.contentType,
      shootType: bookingData.shootType,
      editType: bookingData.editType || "Standard",
      durationHours: bookingData.durationHours,
      startDateTime: new Date(bookingData.startDateTime).toLocaleDateString(
        "en-US",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      ),
      location: bookingData.location,
      shootName: bookingData.shootName || "",
    };

    // Load and process the HTML template
    const htmlContent = await loadTemplate(
      "booking-confirmation",
      templateData
    );

    // Use SendGrid if available, fallback to regular email service
    if (config.sendgrid.apiKey) {
      return await sendgridService.sendHtmlEmail({
        to: guestEmail,
        subject: `Booking Confirmed - ${confirmationNumber}`,
        html: htmlContent,
      });
    } else {
      // Fallback to nodemailer
      const { sendEmail } = require("./email.service");
      return await sendEmail({
        to: guestEmail,
        subject: `Booking Confirmed - ${confirmationNumber}`,
        html: htmlContent,
      });
    }
  } catch (error) {
    logger.error(`Failed to send booking confirmation email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send ops notification email about new booking
 * @param {Object} bookingData - Booking information from form
 * @param {Object} paymentData - Payment information from Stripe
 * @param {string} [bookingId] - Database booking ID if available
 * @returns {Promise<Object>} Result object with success status
 */
const sendOpsNotificationEmail = async (
  bookingData,
  paymentData,
  bookingId = null
) => {
  try {
    const { guestEmail, guestName, guestPhone } = bookingData;
    const { confirmationNumber, transactionId, amount } = paymentData;

    const templateData = {
      confirmationNumber,
      transactionId,
      amount: `$${amount.toFixed(2)}`,
      paymentDate: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      // Booking ID information
      bookingId: bookingId || "Not yet assigned",
      // Client details
      guestName,
      guestEmail,
      guestPhone: guestPhone || "Not provided",
      // Booking details
      contentType: bookingData.contentType,
      shootType: bookingData.shootType,
      editType: bookingData.editType || "Standard",
      durationHours: bookingData.durationHours,
      startDateTime: new Date(bookingData.startDateTime).toLocaleDateString(
        "en-US",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      ),
      location: bookingData.location,
      shootName: bookingData.shootName || "Not specified",
      // Status and priority
      status: "paid",
      priority: "normal",
      urgency: bookingData.isRushOrder ? "urgent" : "normal",
    };

    // Load and process the HTML template
    const htmlContent = await loadTemplate("ops-notification", templateData);

    // Use SendGrid if available, fallback to regular email service
    if (config.sendgrid.apiKey) {
      return await sendgridService.sendHtmlEmail({
        // to: "ali@beigecorporation.io",
        to: "info@beigecorporation.io",
        subject: `New Booking Alert - ${confirmationNumber}`,
        html: htmlContent,
      });
    } else {
      // Fallback to nodemailer
      const { sendEmail } = require("./email.service");
      return await sendEmail({
        to: "info@beigecorporation.io",
        subject: `New Booking Alert - ${confirmationNumber}`,
        html: htmlContent,
      });
    }
  } catch (error) {
    logger.error(`Failed to send ops notification email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send both client confirmation and ops notification emails
 * @param {Object} bookingData - Booking information from form
 * @param {Object} paymentData - Payment information from Stripe
 * @param {string} [bookingId] - Database booking ID if available
 * @returns {Promise<Object>} Combined result object
 */
const sendBookingEmails = async (
  bookingData,
  paymentData,
  bookingId = null
) => {
  try {
    logger.info(
      `[EmailService] Sending booking emails for confirmation ${paymentData.confirmationNumber}`
    );

    // Send both emails in parallel
    const [clientResult, opsResult] = await Promise.allSettled([
      sendBookingConfirmationEmail(bookingData, paymentData),
      sendOpsNotificationEmail(bookingData, paymentData, bookingId),
    ]);

    const results = {
      client: {
        success:
          clientResult.status === "fulfilled"
            ? clientResult.value.success
            : false,
        error:
          clientResult.status === "rejected"
            ? clientResult.reason
            : clientResult.value?.error,
      },
      ops: {
        success:
          opsResult.status === "fulfilled" ? opsResult.value.success : false,
        error:
          opsResult.status === "rejected"
            ? opsResult.reason
            : opsResult.value?.error,
      },
    };

    const overallSuccess = results.client.success && results.ops.success;

    logger.info(
      `[EmailService] Booking emails sent - Client: ${results.client.success}, Ops: ${results.ops.success}`
    );

    return {
      success: overallSuccess,
      results,
      message: overallSuccess
        ? "Both emails sent successfully"
        : "One or both emails failed to send",
    };
  } catch (error) {
    logger.error(
      `[EmailService] Failed to send booking emails: ${error.message}`
    );
    return {
      success: false,
      error: error.message,
      results: { client: { success: false }, ops: { success: false } },
    };
  }
};

/**
 * Test email configuration and templates
 * @returns {Promise<Object>} Test results
 */
const testEmailConfiguration = async () => {
  try {
    const testBookingData = {
      guestName: "Test Client",
      guestEmail: config.email.from,
      guestPhone: "(555) 123-4567",
      contentType: "Photography",
      shootType: "Portrait",
      editType: "Professional",
      durationHours: 2,
      startDateTime: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString(),
      location: "Studio A, Downtown",
      shootName: "Test Shoot",
    };

    const testPaymentData = {
      confirmationNumber: "BRG-TEST-001",
      transactionId: "pi_test_123456789",
      amount: 340.0,
      paymentMethod: "Card ending in ****4242",
    };

    // Test template loading
    const clientTemplate = await loadTemplate(
      "booking-confirmation",
      testBookingData
    );
    const opsTemplate = await loadTemplate("ops-notification", testBookingData);

    logger.info("[EmailService] Template loading test passed");

    // Test SendGrid configuration if available
    let sendGridTest = false;
    if (config.sendgrid.apiKey) {
      sendGridTest = await sendgridService.validateConfiguration();
    }

    return {
      success: true,
      templateLoading: true,
      sendgridConfigured: !!config.sendgrid.apiKey,
      sendgridValidated: sendGridTest,
      message: "Email configuration test completed successfully",
    };
  } catch (error) {
    logger.error(`[EmailService] Configuration test failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      message: "Email configuration test failed",
    };
  }
};

/**
 * Send sales rep confirmation email with shareable link
 * @param {Object} data - Sales rep email data
 * @param {string} data.salesRepEmail - Sales rep's email address
 * @param {string} data.salesRepName - Sales rep's name
 * @param {string} data.clientName - Client's name
 * @param {string} data.clientEmail - Client's email address
 * @param {string} data.shareableLink - Shareable booking link
 * @param {string} data.bookingId - Booking ID
 * @param {string} data.confirmationNumber - Booking confirmation number
 * @param {number} data.amount - Booking amount
 * @returns {Promise<Object>} Result object with success status
 */
const sendSalesRepConfirmation = async (data) => {
  try {
    const {
      salesRepEmail,
      salesRepName,
      clientName,
      clientEmail,
      shareableLink,
      bookingId,
      confirmationNumber,
      amount,
    } = data;

    const subject = `Booking Confirmation - Shareable Link for ${clientName}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #D4B893;">Booking Created Successfully</h2>
        <p>Hi ${salesRepName},</p>
        <p>You've successfully created a booking for your client:</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Booking Details</h3>
          <p><strong>Client Name:</strong> ${clientName}</p>
          <p><strong>Client Email:</strong> ${clientEmail}</p>
          <p><strong>Confirmation Number:</strong> ${confirmationNumber}</p>
          <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
        </div>

        <div style="background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #D4B893;">
          <h3 style="margin-top: 0; color: #D4B893;">📤 Shareable Link</h3>
          <p>Share this link with your client so they can access their booking details:</p>
          <div style="background: white; padding: 15px; border-radius: 4px; margin: 10px 0; word-break: break-all;">
            <a href="${shareableLink}" style="color: #2196f3; text-decoration: none;" clicktracking="off">${shareableLink}</a>
          </div>
          <p style="font-size: 12px; color: #666; margin-top: 15px;">
            💡 <strong>Pro tip:</strong> Your client will need to verify their email address (${clientEmail}) to access the booking details.
          </p>
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Thank you for using Beige!<br>
          <strong>The Beige Team</strong>
        </p>
      </div>
    `;

    logger.info(
      `[Email Enhanced] Sending sales rep confirmation to: ${salesRepEmail}`
    );

    const emailResult = await sendgridService.sendHtmlEmail({
      to: salesRepEmail,
      // to: "ali@beigecorporation.io",
      subject: subject,
      html: htmlContent,
      // from: {
      //   email: "info@beigecorporation.io",
      //   name: "Beige Corporation",
      // },
    });

    if (emailResult.success) {
      logger.info(
        `[Email Enhanced] Sales rep confirmation sent successfully to: ${salesRepEmail}`
      );
    } else {
      logger.error(
        `[Email Enhanced] Failed to send sales rep confirmation: ${emailResult.error}`
      );
    }

    return emailResult;
  } catch (error) {
    logger.error(
      `[Email Enhanced] Error in sendSalesRepConfirmation: ${error.message}`
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send email with HTML content using SendGrid
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @returns {Promise<Object>} Result object with success status
 */
const sendEmail = async (options) => {
  return await sendgridService.sendHtmlEmail(options);
};

module.exports = {
  sendBookingConfirmationEmail,
  sendOpsNotificationEmail,
  sendBookingEmails,
  testEmailConfiguration,
  loadTemplate,
  sendEmail,
  sendSalesRepConfirmation,
};
