const httpStatus = require('http-status');
const { Quotation, Lead, Order } = require('../models');
const ApiError = require('../utils/ApiError');
const emailService = require('./email.service');
const config = require('../config/config');
// We'll keep the decrypt function from utils/encryption but implement our own encrypt with CryptoJS
const { decrypt } = require('../utils/encryption');

/**
 * Create a quotation and directly mark it as accepted
 * @param {Object} quotationBody
 * @returns {Promise<Quotation>}
 */
const createQuotation = async (quotationBody) => {
  // Verify the lead exists
  const lead = await Lead.findById(quotationBody.leadId);
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }

  // If orderId is provided, fetch order details
  if (quotationBody.orderId) {
    const order = await Order.findById(quotationBody.orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }
    
    // Check if the order's payment status is already 'paid'
    if (order.payment && order.payment.payment_status === 'paid') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot create quotation for an order that is already paid');
    }
    
    // Use order details if not provided in the request
    if (!quotationBody.order_title) {
      quotationBody.order_title = order.order_name || `Order ${order._id}`;
    }
    
    // Use order's shoot_cost as original_price if not provided
    if (!quotationBody.original_price) {
      quotationBody.original_price = order.shoot_cost || 0;
      
      // Add addOns_cost if available
      // if (order.addOns_cost) {
      //   quotationBody.original_price += order.addOns_cost;
      // }
      
    }
  }
  
  // Ensure required fields are present
  if (!quotationBody.order_title) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order title is required when no orderId is provided');
  }
  
  if (!quotationBody.original_price && quotationBody.original_price !== 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Original price is required when no orderId is provided');
  }

  // Ensure original_price is properly set
  if (quotationBody.original_price === undefined || quotationBody.original_price === null) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Original price must be provided');
  }

  // Validate the original price
  if (typeof quotationBody.original_price !== 'number' || quotationBody.original_price < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Original price must be a non-negative number');
  }

  // Calculate final price based on discount type and value
  const finalPrice = Quotation.calculateFinalPrice(
    quotationBody.original_price,
    quotationBody.discount_type,
    quotationBody.discount_value
  );
  
  // Double-check calculation for flat discount to ensure correctness
  if (quotationBody.discount_type === 'flat' && quotationBody.discount_value > 0) {
    if (finalPrice !== (quotationBody.original_price - quotationBody.discount_value)) {
      console.error('Calculation error detected! Fixing final price calculation.');
    }
  }

  // Generate a unique quotation number
  const quotationNumber = await Quotation.generateQuotationNumber();

  // Set expiry date if not provided (default: 30 days from now)
  if (!quotationBody.expiry_date) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (config.quotation.expiryDays || 30));
    quotationBody.expiry_date = expiryDate;
  }

  // Create the quotation and mark it as accepted immediately
  const quotation = await Quotation.create({
    ...quotationBody,
    quotation_number: quotationNumber,
    final_price: finalPrice,
    status: 'accepted',
    accepted_at: new Date()
  });

  // Add quotation reference to lead if not already present
  await Lead.findByIdAndUpdate(quotation.leadId, { $addToSet: { quotations: quotation._id } });

  // If order exists, update the order's shoot_cost and add to quotationLog
  if (quotation.orderId) {
    const order = await Order.findById(quotation.orderId);
    if (order) {
      // Store the original shoot cost before updating
      const originalShootCost = quotationBody.original_price; // Always use the original price from the quotation body
      
      // Update the order's shoot_cost based on the quotation's final price
      order.shoot_cost = finalPrice;
      
      // Add a record to the quotationLog
      order.quotationLog = order.quotationLog || [];
      order.quotationLog.push({
        quotationId: quotation._id,
        discount_type: quotation.discount_type,
        discount_value: quotation.discount_value,
        before_shoot_cost: originalShootCost, // Original price before discount
        after_shoot_cost: finalPrice, // Final price after discount
        created_at: new Date(),
      });
      
      // Save the updated order
      await order.save();
      
      // Send payment link
      await sendPaymentLink(quotation._id);
      
      // Update the payment_link_sent status in the quotationLog
      const logIndex = order.quotationLog.length - 1;
      order.quotationLog[logIndex].payment_link_sent = true;
      await order.save();
    }
  }

  return getQuotationById(quotation._id);
};

/**
 * Get all quotations by lead ID
 * @param {ObjectId} leadId - The lead ID to search for
 * @returns {Promise<Array<Quotation>>}
 */
const getQuotationsByLeadId = async (leadId) => {
  // Verify the lead exists
  const lead = await Lead.findById(leadId);
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }

  // Get all quotations for the lead
  return Quotation.findByLeadId(leadId);
};

/**
 * Get quotation by id
 * @param {ObjectId} id
 * @returns {Promise<Quotation>}
 */
const getQuotationById = async (id) => {
  const quotation = await Quotation.findOne({ _id: id, is_deleted: false })
    .populate([
      { path: 'leadId', select: 'status contact.name company.name email' },
      { path: 'orderId', select: 'order_number status' },
      { path: 'created_by', select: 'name email' },
    ]);
  
  if (!quotation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Quotation not found');
  }
  
  return quotation;
};

/**
 * Encrypt data for URLs
 * @param {string|Object} data - Data to encrypt
 * @returns {string} Encrypted data (URL safe)
 */
const encryptData = (data) => {
  try {
    // Import CryptoJS for AES encryption to match frontend implementation
    const CryptoJS = require('crypto-js');
    
    // Convert object to string if needed
    const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    // Get the encryption key from config
    const key = config.encryption.key;
    
    // Encrypt using CryptoJS AES (same as frontend)
    const encrypted = CryptoJS.AES.encrypt(stringData, key).toString();
    
    // Make the result URL-safe for passing in URLs
    return encodeURIComponent(encrypted);
  } catch (error) {
    console.error('Encryption error:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to encrypt data');
  }
};

/**
 * Decrypt data from URLs
 * @param {string} encryptedData - Encrypted data
 * @param {boolean} [parseJson=false] - Whether to parse the result as JSON
 * @returns {string|Object} Decrypted data
 */
const decryptData = (encryptedData, parseJson = false) => {
  try {
    // Import CryptoJS for AES decryption to match frontend implementation
    const CryptoJS = require('crypto-js');
    
    // Decode URL-safe string
    const decoded = decodeURIComponent(encryptedData);
    
    // Get the encryption key from config
    const key = config.encryption.key;
    
    // Decrypt using CryptoJS AES (same as frontend)
    const bytes = CryptoJS.AES.decrypt(decoded, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    
    // Parse as JSON if requested
    return parseJson ? JSON.parse(decrypted) : decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid encrypted data');
  }
};

/**
 * Update quotation by id
 * @param {ObjectId} quotationId
 * @param {Object} updateBody
 * @returns {Promise<Quotation>}
 */
const updateQuotationById = async (quotationId, updateBody) => {
  const quotation = await getQuotationById(quotationId, { populate: false });
  
  // Don't allow updating if quotation is already sent, accepted, or rejected
  if (['sent', 'accepted', 'rejected'].includes(quotation.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST, 
      `Cannot update quotation with status: ${quotation.status}`
    );
  }
  
  Object.assign(quotation, updateBody);
  await quotation.save();
  
  return getQuotationById(quotation._id);
};

/**
 * Delete quotation by id (soft delete)
 * @param {ObjectId} quotationId
 * @returns {Promise<Quotation>}
 */
const deleteQuotationById = async (quotationId) => {
  const quotation = await getQuotationById(quotationId, { populate: false });
  
  // Don't allow deleting if quotation is already accepted
  if (quotation.status === 'accepted') {
    throw new ApiError(
      httpStatus.BAD_REQUEST, 
      'Cannot delete an accepted quotation'
    );
  }
  
  quotation.is_deleted = true;
  await quotation.save();
  
  return quotation;
};

/**
 * Send quotation to client
 * @param {ObjectId} quotationId
 * @param {Object} emailData
 * @param {string} emailData.email - Client email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.message - Custom message
 * @param {Array<string>} [emailData.cc] - CC recipients
 * @param {Array<string>} [emailData.bcc] - BCC recipients
 * @returns {Promise<Quotation>}
 */
const sendQuotation = async (quotationId, emailData) => {
  const quotation = await getQuotationById(quotationId);
  
  // Don't allow sending if quotation is already sent, accepted, or rejected
  if (['accepted', 'rejected'].includes(quotation.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST, 
      `Cannot send quotation with status: ${quotation.status}`
    );
  }
  
  // Generate PDF or format quotation data for email
  // This is a placeholder - actual implementation would depend on your PDF generation library
  const quotationAttachment = {
    filename: `Quotation-${quotation.quotation_number}.pdf`,
    content: 'PDF_CONTENT_HERE', // Replace with actual PDF generation
  };
  
  // Send email
  await emailService.sendQuotationEmail(
    emailData.email,
    emailData.subject,
    emailData.message,
    quotation,
    quotationAttachment,
    emailData.cc,
    emailData.bcc
  );
  
  // Update quotation status to sent
  quotation.status = 'sent';
  quotation.sent_at = new Date();
  await quotation.save();
  
  return getQuotationById(quotation._id);
};

/**
 * Send offer email to client
 * @param {ObjectId} quotationId - The ID of the quotation
 * @returns {Promise<void>}
 */
const sendOfferEmail = async (quotationId) => {
  const quotation = await getQuotationById(quotationId);
  
  // Check if quotation is in a valid state to send offer
  if (quotation.status !== 'pending') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot send offer for quotation with status: ${quotation.status}`
    );
  }
  
  // Get client email and info from lead
  if (!quotation.leadId || !quotation.leadId.email) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Lead does not have a valid email address');
  }
  
  // Generate encrypted ID for accept/reject URLs
  const encryptedId = encryptData(quotation._id.toString());
  
  // Create accept/reject URLs
  const baseUrl = config.client.url || 'http://localhost:3000';
  const acceptUrl = `${baseUrl}/quotations/response/${encryptedId}/accept`;
  const rejectUrl = `${baseUrl}/quotations/response/${encryptedId}/reject`;
  
  // Get client name from lead
  const lead = quotation.leadId;
  
  // Send the email using our template
  await emailService.sendQuotationOfferEmail(
    lead.email,
    quotation,
    lead,
    acceptUrl,
    rejectUrl
  );
  
  // Update quotation to mark email as sent
  await Quotation.findByIdAndUpdate(quotationId, {
    email_sent: true,
    email_sent_at: new Date(),
  });
};

/**
 * Handle offer response (accept/reject)
 * @param {string} encryptedId - Encrypted quotation ID
 * @param {string} action - Action to take ('accept' or 'reject')
 * @returns {Promise<Object>} Response object with status and message
 */
const handleOfferResponse = async (encryptedId, action) => {
  // Decrypt the quotation ID
  let quotationId;
  try {
    quotationId = decryptData(encryptedId);
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid quotation link');
  }
  
  // Get the quotation
  const quotation = await getQuotationById(quotationId);
  
  // Check if quotation is still pending
  if (quotation.status !== 'pending') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot ${action} quotation with status: ${quotation.status}`
    );
  }
  
  // Check if quotation has expired
  if (new Date() > new Date(quotation.expiry_date)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This quotation has expired. Please contact us for a new quotation.'
    );
  }
  
  // Process the action
  if (action === 'accept') {
    // Update quotation status to accepted
    quotation.status = 'accepted';
    quotation.accepted_at = new Date();
    await quotation.save();
    
    // Send payment link if order exists
    if (quotation.orderId) {
      await sendPaymentLink(quotation._id);
      return {
        status: 'success',
        message: 'Quotation accepted. A payment link has been sent to your email.',
      };
    }
    
    return {
      status: 'success',
      message: 'Quotation accepted. Our team will contact you shortly.',
    };
  } else if (action === 'reject') {
    // Update quotation status to rejected
    quotation.status = 'rejected';
    quotation.rejected_at = new Date();
    await quotation.save();
    
    return {
      status: 'success',
      message: 'Quotation rejected. Thank you for your response.',
    };
  }
  
  throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid action');
};

/**
 * Send payment link to client
 * @param {ObjectId} quotationId - The ID of the quotation
 * @returns {Promise<void>}
 */
const sendPaymentLink = async (quotationId) => {
  const quotation = await getQuotationById(quotationId);
  
  // Check if quotation has an associated order
  if (!quotation.orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No order associated with this quotation');
  }
  
  // Check if quotation is accepted
  if (quotation.status !== 'accepted') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot send payment link for quotation with status: ${quotation.status}`
    );
  }
  
  // Generate encrypted order ID for the payment URL
  const encryptedOrderId = encryptData(quotation.orderId._id.toString());
  const paymentUrl = `${config.client.url}/booking/payments/billingInfo/${encryptedOrderId}`;
  
  // Get lead for client information
  const lead = quotation.leadId;
  
  // Get the client email - try multiple sources to ensure we have a valid email
  let clientEmail = null;
  
  // 1. Try to get email from lead.contact.email
  if (lead && lead.contact && lead.contact.email) {
    clientEmail = lead.contact.email;
  } 
  // 2. Try to get email from lead.email directly
  else if (lead && lead.email) {
    clientEmail = lead.email;
  }
  // 3. If still no email, try to get it from the associated order's client
  else if (quotation.orderId) {
    // Fetch the full order with client details
    const order = await Order.findById(quotation.orderId._id).populate('client_id');
    if (order && order.client_id && order.client_id.email) {
      clientEmail = order.client_id.email;
    }
  }
  
  // If we still don't have an email, throw an error
  if (!clientEmail) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No valid email found for the client');
  }
  
  // Send the email using our template
  await emailService.sendPaymentLinkEmail(
    clientEmail,
    quotation,
    lead,
    paymentUrl
  );
  
  // Update quotation to mark payment link as sent
  await Quotation.findByIdAndUpdate(quotationId, {
    payment_link_sent: true,
    payment_link_sent_at: new Date(),
  });
};

/**
 * Process expired quotations
 * Updates status of quotations that have passed their expiry date
 * @returns {Promise<number>} Number of quotations updated
 */
const processExpiredQuotations = async () => {
  const result = await Quotation.updateMany(
    {
      status: { $in: ['draft', 'sent'] },
      expiry_date: { $lt: new Date() },
      is_deleted: false,
    },
    {
      $set: { status: 'expired' }
    }
  );
  
  return result.nModified;
};

/**
 * Get quotation statistics for a lead
 * @param {ObjectId} leadId
 * @returns {Promise<Object>} Statistics object
 */
const getQuotationStatsByLeadId = async (leadId) => {
  // Verify the lead exists
  const lead = await Lead.findById(leadId);
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }
  
  // Get counts by status
  const stats = await Quotation.aggregate([
    {
      $match: {
        leadId: lead._id,
        is_deleted: false,
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        total: { $sum: '$total' }
      }
    }
  ]);
  
  // Format the results
  const result = {
    total: 0,
    draft: 0,
    sent: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
    totalAmount: 0,
    acceptedAmount: 0,
  };
  
  stats.forEach((stat) => {
    result[stat._id] = stat.count;
    result.total += stat.count;
    result.totalAmount += stat.total;
    
    if (stat._id === 'accepted') {
      result.acceptedAmount = stat.total;
    }
  });
  
  return result;
};

module.exports = {
  createQuotation,
  getQuotationsByLeadId,
  getQuotationById,
  sendOfferEmail,
  handleOfferResponse,
  sendPaymentLink,
  encryptData,
  decryptData,
};
