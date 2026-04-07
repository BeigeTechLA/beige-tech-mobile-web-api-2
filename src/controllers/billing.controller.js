/**
 * Billing Controller
 * 
 * This controller handles billing-related API endpoints
 */

const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
const { billingService } = require('../services');

/**
 * Get all billing records with pagination
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getBillings = catchAsync(async (req, res) => {
  // Extract filter conditions from query params
  const filter = pick(req.query, ['payment.payment_status', 'order_status']);
  
  // Extract pagination options from query params
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  
  // Set default pagination options if not provided
  options.sortBy = options.sortBy || 'createdAt:desc';
  options.limit = options.limit ? parseInt(options.limit, 10) : 10;
  options.page = options.page ? parseInt(options.page, 10) : 1;
  const role = req.query.role;
  // For client role, filter by client_id
  if (role === 'user') {
    // If client_id is provided in query and matches the user's ID, use it
    // Otherwise, use the user's ID
    const clientId = req.query.client_id
      ? req.query.client_id 
      : null;
    
    // Set client_id filter
    filter.client_id = mongoose.Types.ObjectId.isValid(clientId) 
      ? new mongoose.Types.ObjectId(clientId) 
      : null;
  }

  // Get billing records from service
  const result = await billingService.getBillings(filter, options);
  
  // Send response
  res.status(httpStatus.OK).send(result);
});

/**
 * Get billing details by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getBillingById = catchAsync(async (req, res) => {
  // Get billing ID from request params
  const billingId = req.params.billingId;
  
  // Get billing details from service
  const billing = await billingService.getBillingById(billingId);
  
  // Apply role-based access control
  const { user } = req;
  
  // If user is not admin, verify they have access to this billing record
  if (user && user.role !== 'admin') {
    const hasAccess = checkUserAccessToBilling(user, billing);
    
    if (!hasAccess) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access this billing record');
    }
  }
  
  // Send response
  res.status(httpStatus.OK).send(billing);
});

/**
 * Helper function to check if a user has access to a billing record
 * @param {Object} user - User object
 * @param {Object} billing - Billing record
 * @returns {boolean} - Whether the user has access
 */
const checkUserAccessToBilling = (user, billing) => {
  // Admin has access to all billing records
  if (user.role === 'admin') {
    return true;
  }
  
  // Client can only access their own billing records
  if (user.role === 'client') {
    return billing.clientDetails && 
           billing.clientDetails.clientId && 
           billing.clientDetails.clientId.toString() === user.id.toString();
  }
  
  // Service provider can only access billing records where they are listed
  if (user.role === 'service_provider' || user.role === 'cp') {
    return billing.serviceProviderDetails && 
           billing.serviceProviderDetails.some(provider => 
             provider.providerId && provider.providerId.toString() === user.id.toString()
           );
  }
  
  // Default: no access
  return false;
};

/**
 * Download invoice as PDF
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const downloadInvoice = catchAsync(async (req, res) => {
  // Get billing ID from request params
  const billingId = req.params.billingId;
  
  try {
    // Get billing details from service
    const billing = await billingService.getBillingById(billingId);
    // console.log("billing", billing);
    
    if (!billing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Billing record not found');
    }
  
    // Check if the user has access to this billing record
    // const userId = req.user.id;
    // const isAdmin = req.user.role === 'admin';
    // const isClient = billing.clientDetails && billing.clientDetails.clientId && 
    //                 billing.clientDetails.clientId.toString() === userId;
    // const isServiceProvider = billing.serviceProviderDetails && 
    //                         billing.serviceProviderDetails.some(provider => 
    //                           provider.providerId && provider.providerId.toString() === userId
    //                         );

    // if (!isAdmin && !isClient && !isServiceProvider) {
    //   throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access this invoice');
    // }
    
    // Generate invoice HTML
    const invoiceHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${billing.billingOverview.invoice}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .invoice-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .invoice-header h1 {
          color: #444;
          margin-bottom: 5px;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .invoice-details .left, .invoice-details .right {
          width: 48%;
        }
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .invoice-table th, .invoice-table td {
          padding: 10px;
          border-bottom: 1px solid #ddd;
          text-align: left;
        }
        .invoice-table th {
          background-color: #f5f5f5;
        }
        .invoice-summary {
          text-align: right;
          margin-top: 30px;
        }
        .status {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 4px;
          font-weight: bold;
        }
        .status.paid {
          background-color: #d4edda;
          color: #155724;
        }
        .status.pending {
          background-color: #fff3cd;
          color: #856404;
        }
        .status.partially-paid {
          background-color: #d1ecf1;
          color: #0c5460;
        }
      </style>
    </head>
    <body>
      <div class="invoice-header">
        <h1>INVOICE</h1>
        <p>${billing.billingOverview.invoice}</p>
      </div>
      
      <div class="invoice-details">
        <div class="left">
          <h3>Billed To:</h3>
          <p>${billing.clientDetails.clientName}<br>
          ${billing.clientDetails.clientEmail}<br>
          ${billing.clientDetails.clientContact || 'N/A'}<br>
          ${billing.clientDetails.clientLocation || 'N/A'}</p>
        </div>
        <div class="right">
          <h3>Invoice Details:</h3>
          <p>
            <strong>Date:</strong> ${new Date(billing.billingOverview.date).toLocaleDateString()}<br>
            <strong>Status:</strong> <span class="status ${billing.billingOverview.status.toLowerCase().replace(' ', '-')}">${billing.billingOverview.status}</span><br>
            <strong>Order ID:</strong> ${billing.orderDetails.orderId}<br>
            <strong>Order Name:</strong> ${billing.orderDetails.orderName || 'N/A'}
          </p>
        </div>
      </div>
      
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Service Provider</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Photography Services - ${billing.orderDetails.orderName || 'Photography Session'}</td>
            <td>${billing.serviceProviderDetails.map(provider => provider.providerName).join(', ') || 'N/A'}</td>
            <td>$${billing.billingOverview.amount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      
      <div class="invoice-summary">
        <p><strong>Subtotal:</strong> $${billing.billingOverview.amount.toFixed(2)}</p>
        <p><strong>Total Paid:</strong> $${billing.transactionSummary.totalPaid.toFixed(2)}</p>
        <p><strong>Amount Due:</strong> $${(billing.orderDetails.amountRemaining || 0).toFixed(2)}</p>
      </div>
      
      <div class="transaction-details">
        <h3>Transaction Details:</h3>
        <p>
          <strong>Transaction ID:</strong> ${billing.transactionSummary.transactionId}<br>
          <strong>Payment Method:</strong> ${billing.transactionSummary.paymentMethod}<br>
          <strong>Payment Date:</strong> ${billing.transactionSummary.paymentDate ? new Date(billing.transactionSummary.paymentDate).toLocaleDateString() : 'N/A'}
        </p>
      </div>
    </body>
    </html>
  `;
    
    // Send the HTML response (for now)
    // In a production environment, you would convert this to PDF using a library like puppeteer or html-pdf
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${billing.billingOverview.invoice}.html"`);
    res.send(invoiceHtml);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error generating invoice: ${error.message}`);
  }
});

/**
 * Download professional invoice as PDF
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const downloadProfessionalInvoice = catchAsync(async (req, res) => {
  // Get billing ID from request params
  const billingId = req.params.billingId;
  
  try {
    // Get billing details from service
    const billing = await billingService.getBillingById(billingId);
    
    if (!billing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Billing record not found');
    }
    
    // Check if the user has access to this billing record
    // const userId = req.user.id;
    // const isAdmin = req.user.role === 'admin';
    // const isClient = billing.clientDetails && billing.clientDetails.clientId && 
    //                 billing.clientDetails.clientId.toString() === userId;
    // const isServiceProvider = billing.serviceProviderDetails && 
    //                         billing.serviceProviderDetails.some(provider => 
    //                           provider.providerId && provider.providerId.toString() === userId
    //                         );

    // if (!isAdmin && !isClient && !isServiceProvider) {
    //   throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access this invoice');
    // }
  
  // Generate PDF invoice using the billing service
  const pdfBuffer = await billingService.generateProfessionalInvoicePDF(billing);
  
  // Set response headers for PDF download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${billing.billingOverview.invoice}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  
  // Send the PDF buffer
  res.send(pdfBuffer);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error generating PDF invoice: ${error.message}`);
  }
});

module.exports = {
  getBillings,
  getBillingById,
  downloadInvoice,
  downloadProfessionalInvoice
};
