const nodemailer = require("nodemailer");
const config = require("../config/config");
const logger = require("../config/logger");

/**
 * Email templates
 */
const templates = {
  /**
   * Template for quotation offer emails
   * @param {Object} data - Template data
   * @returns {string} - Formatted email text
   */
  quotation_offer: (data) => {
    const { clientName, orderTitle, originalPrice, finalPrice, currency, discountInfo, expiryDate, acceptUrl, rejectUrl, notes } = data;
    
    return `Dear ${clientName || 'Client'},

We are pleased to provide you with a quotation for "${orderTitle}".

Quotation Details:
- Original Price: ${originalPrice.toFixed(2)} ${currency}
${discountInfo ? `- ${discountInfo}\n` : ''}- Final Price: ${finalPrice.toFixed(2)} ${currency}
- Valid Until: ${new Date(expiryDate).toLocaleDateString()}
${notes ? `\nNotes:\n${notes}` : ''}

To respond to this offer, please click one of the following links:
- To ACCEPT this quotation: ${acceptUrl}
- To REJECT this quotation: ${rejectUrl}

If you have any questions, please don't hesitate to contact us.

Thank you for your business.

Best regards,
The Beige Corporation Team`;
  },
  
  /**
   * Template for payment link emails
   * @param {Object} data - Template data
   * @returns {string} - Formatted email text
   */
  payment_link: (data) => {
    const { clientName, orderTitle, finalPrice, currency, paymentUrl } = data;

    return `Dear ${clientName || 'Client'},

Thank you for accepting our quotation for "${orderTitle}".

To complete your order, please use the payment link below:

Amount payable: ${finalPrice.toFixed(2)} ${currency}
Payment Link: ${paymentUrl}

If you have any questions, please don't hesitate to contact us.

Thank you for your business.

Best regards,
The Beige Corporation Team`;
  },

  /**
   * Template for creative assignment notification
   * @param {Object} data - Template data
   * @returns {string} - Formatted email text
   */
  creative_assignment: (data) => {
    const { clientName, creativeName, creativePhone, creativeEmail, creativeSocial } = data;

    return `Dear ${clientName || 'Client'},

Great news! Your creative has been assigned.

Creative Contact Information:
- Name: ${creativeName}
- Phone: ${creativePhone}${creativeEmail ? `\n- Email: ${creativeEmail}` : ''}${creativeSocial ? `\n- Social Media: ${creativeSocial}` : ''}

The Beige operations team will be reaching out to you via text shortly to coordinate the details of your shoot.

If you have any questions, please don't hesitate to contact us.

Thank you for choosing Beige!

Best regards,
The Beige Team`;
  }
};

let transport;
try {
  transport = nodemailer.createTransport(config.email.smtp);
  /* istanbul ignore next */
  if (config.env !== "test") {
    transport
      .verify()
      .then(() => logger.info("Connected to email server"))
      .catch((error) =>
        logger.warn(
          `Unable to connect to email server: ${error.message}. Make sure you have configured the SMTP options in .env`
        )
      );
  }
} catch (error) {
  logger.error(`Failed to create email transport: ${error.message}`);
  // Create a dummy transport that logs instead of sending
  transport = {
    sendMail: (mailOptions) => {
      logger.info(`[EMAIL NOT SENT - TRANSPORT ERROR] To: ${mailOptions.to}, Subject: ${mailOptions.subject}`);
      return Promise.resolve({ response: 'Dummy transport - email not sent' });
    }
  };
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Email text (if not using template)
 * @param {string} [options.template] - Template name
 * @param {Object} [options.templateData] - Data for the template
 * @param {Array<string>} [options.cc] - CC recipients
 * @param {Array<string>} [options.bcc] - BCC recipients
 * @param {Array<Object>} [options.attachments] - Email attachments
 * @returns {Promise<Object>} Result object with success status
 */
const sendEmail = async (options) => {
  try {
    const { to, subject, text, html, template, templateData, cc, bcc, attachments } = options;

    let emailText = text;
    let emailHtml = html;

    // If template is specified, use it instead of raw text
    if (template && templates[template]) {
      emailText = templates[template](templateData || {});
    }

    const msg = {
      from: config.email.from,
      to,
      subject,
      text: emailText,
      ...(emailHtml && { html: emailHtml }), // Include HTML if provided
      cc,
      bcc,
      attachments
    };

    await transport.sendMail(msg);
    return { success: true };
  } catch (error) {
    logger.error(`Email sending failed: ${error.message}`);
    // Return success true to prevent crashes in other services that depend on email
    return { success: false, error: error.message };
  }
};

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to, token) => {
  const subject = "Reset password";
  // Use dynamic CLIENT_URL from config
  const resetPasswordUrl = `${config.client.url}/Auth/reset_password/setnewpassword?token=${token}`;
  const text = `Dear user,
To reset your password, click on this link: ${resetPasswordUrl}
If you did not request any password resets, then ignore this email.`;
  
  return await sendEmail({
    to,
    subject,
    text
  });
};

/**
 * Send verification email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendVerificationEmail = async (to, token) => {
  const subject = "Email Verification";
  // Use dynamic CLIENT_URL from config
  const verificationEmailUrl = `${config.client.url}/verify-email?token=${token}`;
  const text = `Dear user,
To verify your email, click on this link: ${verificationEmailUrl}
If you did not create an account, then ignore this email.`;
  
  return await sendEmail({
    to,
    subject,
    text
  });
};

/**
 * Send subscription confirmation email to the subscriber
 * @param {string} to - Subscriber's email
 * @param {Object} data - Contains name and businessName
 * @returns {Promise}
 */
const sendSubscriptionConfirmation = async (to, data) => {
  const subject = "Thank you for subscribing!";
  const text = `Dear ${data.name},

  Thank you for subscribing with your business "${data.businessName}".

  We have received your subscription request and will review it shortly.

  Best regards,
  The Beige Corporation Team`;
  
  return await sendEmail({
    to,
    subject,
    text
  });
};

/**
 * Send new subscriber notification to admin
 * @param {string} to - Admin email
 * @param {Object} data - Contains subscriber details
 * @returns {Promise}
 */
const sendNewSubscriberNotification = async (to, data) => {
  const subject = "New Subscription Request";
  const text = `Dear Admin,
  
  A new subscription request has been received:

  Name: ${data.name}
  Business Name: ${data.businessName}
  Email: ${data.email}
  Phone Number: ${data.phoneNumber}
  Location: ${data.location}

  Please review this request in the admin dashboard.

  Best regards,
  Beige Corporation System`;
    
  return await sendEmail({
    to,
    subject,
    text
  });
};

/**
 * Send quotation email to client (legacy method)
 * @param {string} to - Client email
 * @param {string} subject - Email subject
 * @param {string} message - Custom message
 * @param {Object} quotation - Quotation object
 * @param {Object} attachment - PDF attachment
 * @param {Array<string>} [cc] - CC recipients
 * @param {Array<string>} [bcc] - BCC recipients
 * @returns {Promise}
 */
const sendQuotationEmail = async (to, subject, message, quotation, attachment, cc = [], bcc = []) => {
  try {
    // Format the quotation details for the email body
    const formattedItems = quotation.items?.map(item => 
      `${item.name} (${item.quantity} x ${item.unit_price.toFixed(2)}) = ${item.total.toFixed(2)}`
    ).join('\n') || '';
    
    const text = `Dear Client,

${message || 'Please find attached our quotation for your review.'}

Quotation Details:
Quotation Number: ${quotation.quotation_number}
Issue Date: ${new Date(quotation.createdAt || Date.now()).toLocaleDateString()}
Expiry Date: ${new Date(quotation.expiry_date).toLocaleDateString()}
Total Amount: ${quotation.final_price.toFixed(2)} ${quotation.currency}

${quotation.notes ? `Notes:\n${quotation.notes}\n\n` : ''}

Thank you for your business.

Best regards,
The Beige Corporation Team`;

    return await sendEmail({
      to,
      subject,
      text,
      cc,
      bcc,
      attachments: attachment ? [attachment] : undefined
    });
  } catch (error) {
    logger.error(`Quotation email sending failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send quotation offer email with accept/reject links
 * @param {string} to - Client email
 * @param {Object} quotation - Quotation object
 * @param {Object} lead - Lead object containing client information
 * @param {string} acceptUrl - URL for accepting the offer
 * @param {string} rejectUrl - URL for rejecting the offer
 * @returns {Promise}
 */
const sendQuotationOfferEmail = async (to, quotation, lead, acceptUrl, rejectUrl) => {
  try {
    const subject = `Quotation for ${quotation.order_title}`;
    
    // Prepare discount info text if applicable
    let discountInfo = null;
    if (quotation.discount_type === 'flat' && quotation.discount_value > 0) {
      discountInfo = `Discount: ${quotation.discount_value.toFixed(2)} ${quotation.currency} (Flat)`;
    } else if (quotation.discount_type === 'percentage' && quotation.discount_value > 0) {
      discountInfo = `Discount: ${quotation.discount_value}% (Percentage)`;
    }
    
    // Use template for email content
    return await sendEmail({
      to,
      subject,
      template: 'quotation_offer',
      templateData: {
        clientName: lead?.client_name || 'Client',
        orderTitle: quotation.order_title,
        originalPrice: quotation.original_price,
        finalPrice: quotation.final_price,
        currency: quotation.currency,
        discountInfo,
        expiryDate: quotation.expiry_date,
        acceptUrl,
        rejectUrl,
        notes: quotation.notes
      }
    });
  } catch (error) {
    logger.error(`Quotation offer email sending failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send payment link email
 * @param {string} to - Client email
 * @param {Object} quotation - Quotation object
 * @param {Object} lead - Lead object containing client information
 * @param {string} paymentUrl - URL for making payment
 * @returns {Promise}
 */
const sendPaymentLinkEmail = async (to, quotation, lead, paymentUrl) => {
  try {
    const subject = `Payment Link for ${quotation.order_title}`;

    // Use template for email content
    return await sendEmail({
      to,
      subject,
      template: 'payment_link',
      templateData: {
        clientName: lead?.client_name || 'Client',
        orderTitle: quotation.order_title,
        finalPrice: quotation.final_price,
        currency: quotation.currency,
        paymentUrl
      }
    });
  } catch (error) {
    logger.error(`Payment link email sending failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send creative assignment notification email
 * @param {string} to - Client email
 * @param {Object} data - Creative and client information
 * @param {string} data.clientName - Client's name
 * @param {string} data.creativeName - Creative's name (required)
 * @param {string} data.creativePhone - Creative's phone (required)
 * @param {string} [data.creativeEmail] - Creative's email (optional)
 * @param {string} [data.creativeSocial] - Creative's social handles (optional)
 * @returns {Promise}
 */
const sendCreativeAssignmentEmail = async (to, data) => {
  try {
    const subject = "Your Creative Has Been Assigned!";

    // Use template for email content
    return await sendEmail({
      to,
      subject,
      template: 'creative_assignment',
      templateData: {
        clientName: data.clientName || 'Client',
        creativeName: data.creativeName,
        creativePhone: data.creativePhone,
        creativeEmail: data.creativeEmail,
        creativeSocial: data.creativeSocial
      }
    });
  } catch (error) {
    logger.error(`Creative assignment email sending failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

module.exports = {
  transport,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendSubscriptionConfirmation,
  sendNewSubscriberNotification,
  sendQuotationEmail,
  sendQuotationOfferEmail,
  sendPaymentLinkEmail,
  sendCreativeAssignmentEmail,
};
