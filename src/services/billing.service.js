/**
 * Billing Service
 * 
 * This service processes data from the Order model (specifically using the payment_status field)
 * and aggregates related information for display.
 */

const httpStatus = require('http-status');
const { Order, User, CP, Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');

/**
 * Get all billing records with pagination
 * @param {Object} filter - Filter criteria
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page
 * @param {number} [options.page] - Current page number
 * @param {Date} [options.startDate] - Filter by start date
 * @param {Date} [options.endDate] - Filter by end date
 * @returns {Promise<QueryResult>} - Paginated billing records
 */
const getBillings = async (filter, options) => {
  try {
    // Build match criteria
    const matchCriteria = { ...filter };
    
    // Add date range filtering if provided
    if (options.startDate || options.endDate) {
      matchCriteria.createdAt = {};
      
      if (options.startDate) {
        matchCriteria.createdAt.$gte = new Date(options.startDate);
      }
      
      if (options.endDate) {
        matchCriteria.createdAt.$lte = new Date(options.endDate);
      }
    }
    
    // Handle partial client ID if provided
    if (options.partialClientId) {
      // Remove any client_id from matchCriteria as we'll handle it differently
      delete matchCriteria.client_id;
    }
    
    const pipeline = [
      // Match orders based on filter criteria
      { $match: matchCriteria },
      
      // Add a stage to convert ObjectIds to strings for partial matching if needed
      ...(options.partialClientId ? [
        {
          $addFields: {
            clientIdString: { $toString: "$client_id" }
          }
        },
        {
          $match: {
            clientIdString: { $regex: new RegExp('^' + options.partialClientId) }
          }
        }
      ] : []),
      
      // Lookup client information from User model
      {
        $lookup: {
          from: 'users',
          localField: 'client_id',
          foreignField: '_id',
          as: 'client'
        }
      },
      
      // Unwind client array (since it's a 1:1 relationship)
      {
        $unwind: {
          path: '$client',
          preserveNullAndEmptyArrays: true
        }
      },
      
      // Lookup payment information
      {
        $lookup: {
          from: 'payments',
          localField: 'payment.payment_ids',
          foreignField: '_id',
          as: 'paymentDetails'
        }
      },
      
      // Lookup service provider information
      {
        $lookup: {
          from: 'users',
          localField: 'cp_ids.id',
          foreignField: '_id',
          as: 'serviceProviders'
        }
      },
      
      // Format the response
      {
        $project: {
          _id: 1,
          invoice: { $concat: ['INV-', { $substr: [{ $toString: '$_id' }, 0, 8] }] },
          createdAt: '$createdAt',
          date: { $dateToString: { format: '%d %b %Y %H:%M:%S', date: '$createdAt', timezone: 'Asia/Dhaka' } },
          serviceProvider: {
            $cond: {
              if: { $gt: [{ $size: '$serviceProviders' }, 0] },
              then: { $arrayElemAt: ['$serviceProviders.name', 0] },
              else: 'N/A'
            }
          },
          amount: { $ifNull: ['$payment.amount_paid', 0] },
          paymentMethod: {
            $cond: {
              if: { $gt: [{ $size: '$paymentDetails' }, 0] },
              then: { $arrayElemAt: ['$paymentDetails.description', 0] },
              else: 'N/A'
            }
          },
          status: {
            $switch: {
              branches: [
                { case: { $eq: ['$payment.payment_status', 'paid'] }, then: 'Paid' },
                { case: { $eq: ['$payment.payment_status', 'partially_paid'] }, then: 'Partially Paid' },
                { case: { $eq: ['$payment.payment_status', 'pending'] }, then: 'Pending' }
              ],
              default: 'Pending'
            }
          },
          // Additional transaction details
          transactionSummary: {
            invoiceNumber: { $concat: ['#INV-', { $substr: [{ $toString: '$_id' }, 0, 8] }] },
            paymentMethod: {
              $cond: {
                if: { $gt: [{ $size: '$paymentDetails' }, 0] },
                then: { $arrayElemAt: ['$paymentDetails.description', 0] },
                else: 'N/A'
              }
            },
            transactionId: {
              $cond: {
                if: { $gt: [{ $size: '$paymentDetails' }, 0] },
                then: { $arrayElemAt: ['$paymentDetails.intent_id', 0] },
                else: 'N/A'
              }
            },
            paymentDate: {
              $cond: {
                if: { $eq: ['$payment.payment_status', 'paid'] },
                then: { $dateToString: { format: '%d %b %Y %H:%M:%S', date: '$updatedAt', timezone: 'Asia/Dhaka' } },
                else: null
              }
            },
            totalPaid: { $ifNull: ['$payment.amount_paid', 0] }
          },
          // Original order data for reference
          orderDetails: {
            orderId: '$_id',
            orderName: '$order_name',
            orderStatus: '$order_status',
            shootCost: '$shoot_cost',
            paymentStatus: '$payment.payment_status',
            amountRemaining: { $ifNull: ['$payment.amount_remaining', 0] }
          },
          // Client information
          clientDetails: {
            clientId: '$client._id',
            clientName: '$client.name',
            clientEmail: '$client.email',
            clientContact: '$client.contact_number'
          }
        }
      }
    ];

    // Apply sorting based on options.sortBy (default: createdAt desc)
    const sortCriteria = {};
    if (options.sortBy) {
      const [sortField, sortOrder] = options.sortBy.split(':');
      sortCriteria[sortField] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortCriteria.createdAt = -1;
    }
    pipeline.push({ $sort: sortCriteria });

    // Add pagination
    const paginationPipeline = [
      {
        $facet: {
          results: [
            { $skip: (options.page - 1) * options.limit },
            { $limit: options.limit }
          ],
          totalResults: [
            { $count: 'count' }
          ]
        }
      },
      {
        $project: {
          results: 1,
          totalPages: {
            $ceil: {
              $divide: [
                { $arrayElemAt: ['$totalResults.count', 0] },
                options.limit
              ]
            }
          },
          totalResults: { $arrayElemAt: ['$totalResults.count', 0] }
        }
      }
    ];
    
    // Execute the aggregation pipeline
    const [result] = await Order.aggregate([...pipeline, ...paginationPipeline]);
    
    return {
      results: result.results || [],
      page: options.page,
      limit: options.limit,
      totalPages: result.totalPages || 0,
      totalResults: result.totalResults || 0
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving billing records');
  }
};

/**
 * Get billing details by ID
 * @param {string} billingId - Billing/Order ID
 * @returns {Promise<Object>} - Billing details
 */
const getBillingById = async (billingId) => {
  console.log("billingId", billingId);
  try {
    // Validate the billing ID format
    if (!mongoose.Types.ObjectId.isValid(billingId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid billing ID format');
    }
    
    const pipeline = [
      // Match the specific order
      { $match: { _id: new mongoose.Types.ObjectId(billingId) } },
      
      // Lookup client information
      {
        $lookup: {
          from: 'users',
          localField: 'client_id',
          foreignField: '_id',
          as: 'client'
        }
      },
      
      // Unwind client array
      {
        $unwind: {
          path: '$client',
          preserveNullAndEmptyArrays: true
        }
      },
      
      // Lookup payment information
      {
        $lookup: {
          from: 'payments',
          localField: 'payment.payment_ids',
          foreignField: '_id',
          as: 'paymentDetails'
        }
      },
      
      // Lookup service provider information
      {
        $lookup: {
          from: 'users',
          localField: 'cp_ids.id',
          foreignField: '_id',
          as: 'serviceProviders'
        }
      },
      
      // Format the response for detailed view
      {
        $project: {
          _id: 1,
          billingOverview: {
            invoice: { $concat: ['#INV-', { $substr: [{ $toString: '$_id' }, 0, 8] }] },
            date: '$createdAt',
            amount: { $ifNull: ['$payment.amount_paid', 0] },
            status: {
              $switch: {
                branches: [
                  { case: { $eq: ['$payment.payment_status', 'paid'] }, then: 'Paid' },
                  { case: { $eq: ['$payment.payment_status', 'partially_paid'] }, then: 'Partially Paid' },
                  { case: { $eq: ['$payment.payment_status', 'pending'] }, then: 'Pending' }
                ],
                default: 'Pending'
              }
            }
          },
          transactionSummary: {
            invoiceNumber: { $concat: ['#INV-', { $substr: [{ $toString: '$_id' }, 0, 8] }] },
            paymentMethod: {
              $cond: {
                if: { $gt: [{ $size: '$paymentDetails' }, 0] },
                then: { $arrayElemAt: ['$paymentDetails.description', 0] },
                else: 'N/A'
              }
            },
            transactionId: {
              $cond: {
                if: { $gt: [{ $size: '$paymentDetails' }, 0] },
                then: { $arrayElemAt: ['$paymentDetails.intent_id', 0] },
                else: 'N/A'
              }
            },
            paymentDate: {
              $cond: {
                if: { $eq: ['$payment.payment_status', 'paid'] },
                then: { $dateToString: { format: '%d %b %Y %H:%M:%S', date: '$updatedAt', timezone: 'Asia/Dhaka' } },
                else: null
              }
            },
            totalPaid: { $ifNull: ['$payment.amount_paid', 0] }
          },
          orderDetails: {
            orderId: '$_id',
            orderName: '$order_name',
            orderStatus: '$order_status',
            shootCost: '$shoot_cost',
            paymentStatus: '$payment.payment_status',
            amountRemaining: { $ifNull: ['$payment.amount_remaining', 0] },
            shootDates: '$shoot_datetimes'
          },
          clientDetails: {
            clientId: '$client._id',
            clientName: '$client.name',
            clientEmail: '$client.email',
            clientContact: '$client.contact_number',
            clientLocation: '$client.location'
          },
          serviceProviderDetails: {
            $map: {
              input: '$serviceProviders',
              as: 'provider',
              in: {
                providerId: '$$provider._id',
                providerName: '$$provider.name',
                providerEmail: '$$provider.email',
                providerContact: '$$provider.contact_number'
              }
            }
          }
        }
      }
    ];
    
    const [result] = await Order.aggregate(pipeline);
    
    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Billing record not found');
    }
    
    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving billing details: ' + error.message);
  }
};
/**
 * Generate a professional PDF invoice
 * @param {Object} billing - Billing record
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateProfessionalInvoicePDF = async (billing) => {
  try {
    // Create a professional HTML template for the invoice
    const invoiceHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice ${billing.billingOverview.invoice}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            background-color: #f9f9f9;
          }
          .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 30px;
            background-color: #fff;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
          }
          .invoice-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            align-items: center;
          }
          .invoice-branding {
            display: flex;
            flex-direction: column;
          }
          .logo-placeholder {
            width: 80px;
            height: 80px;
            background-color: #f0f0f0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: #555;
            margin-bottom: 10px;
          }
          .invoice-title {
            font-size: 32px;
            font-weight: 700;
            color: #2c3e50;
            letter-spacing: 1px;
          }
          .invoice-number {
            font-size: 16px;
            color: #7f8c8d;
            margin-top: 5px;
          }
          .company-details {
            text-align: right;
          }
          .company-details h2 {
            margin: 0 0 5px;
            color: #2c3e50;
          }
          .company-details p {
            margin: 0;
            color: #7f8c8d;
            line-height: 1.5;
          }
          .invoice-meta {
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
          }
          .meta-item {
            flex: 1;
          }
          .meta-label {
            font-size: 12px;
            text-transform: uppercase;
            color: #95a5a6;
            margin-bottom: 5px;
          }
          .meta-value {
            font-size: 16px;
            font-weight: 600;
            color: #2c3e50;
          }
          .invoice-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          .client-details, .order-details {
            flex-basis: 48%;
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
          }
          .detail-row {
            margin-bottom: 10px;
            display: flex;
          }
          .detail-label {
            font-weight: 600;
            color: #7f8c8d;
            width: 140px;
          }
          .detail-value {
            color: #2c3e50;
            flex: 1;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border-radius: 6px;
            overflow: hidden;
          }
          .invoice-table th {
            background-color: #2c3e50;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
          }
          .invoice-table td {
            padding: 15px;
            border-bottom: 1px solid #e0e0e0;
          }
          .invoice-table tr:nth-child(even) {
            background-color: #f8f9fa;
          }
          .invoice-table tr:last-child td {
            border-bottom: none;
          }
          .invoice-summary {
            margin-top: 30px;
            margin-left: auto;
            width: 350px;
            background-color: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-row.total {
            font-weight: 700;
            font-size: 18px;
            color: #2c3e50;
            border-top: 2px solid #2c3e50;
            padding-top: 15px;
            margin-top: 10px;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .status-paid {
            background-color: #27ae60;
            color: white;
          }
          .status-partial {
            background-color: #f39c12;
            color: white;
          }
          .status-pending {
            background-color: #e74c3c;
            color: white;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #7f8c8d;
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
            padding-top: 20px;
          }
          .footer p {
            margin: 5px 0;
          }
          .thank-you {
            font-size: 24px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 10px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <div class="invoice-branding">
              <div class="logo-placeholder">BEIGE</div>
              <div class="invoice-title">INVOICE</div>
              <div class="invoice-number">${billing.billingOverview.invoice}</div>
            </div>
            <div class="company-details">
              <h2>Beige Corporation</h2>
              <p>
                123 Photography Lane<br>
                San Francisco, CA 94107<br>
                United States<br>
                contact@beigecorp.com
              </p>
            </div>
          </div>
          
          <div class="invoice-meta">
            <div class="meta-item">
              <div class="meta-label">Date Issued</div>
              <div class="meta-value">${new Date(billing.billingOverview?.date || Date.now()).toLocaleDateString()}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Status</div>
              <div class="meta-value">
                <span class="status-badge ${billing.billingOverview?.status === 'Paid' ? 'status-paid' : billing.billingOverview?.status === 'Partially Paid' ? 'status-partial' : 'status-pending'}">
                  ${billing.billingOverview?.status || 'Pending'}
                </span>
              </div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Order ID</div>
              <div class="meta-value">${billing.orderDetails?.orderId ? billing.orderDetails.orderId.toString().slice(-6) : 'N/A'}</div>
            </div>
          </div>
          
          <div class="invoice-details">
            <div class="client-details">
              <div class="section-title">Client Information</div>
              <div class="detail-row">
                <div class="detail-label">Name:</div>
                <div class="detail-value">${billing.clientDetails?.clientName || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Email:</div>
                <div class="detail-value">${billing.clientDetails?.clientEmail || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Contact:</div>
                <div class="detail-value">${billing.clientDetails?.clientContact || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Location:</div>
                <div class="detail-value">${billing.clientDetails?.clientLocation || 'N/A'}</div>
              </div>
            </div>
            
            <div class="order-details">
              <div class="section-title">Order Details</div>
              <div class="detail-row">
                <div class="detail-label">Order Name:</div>
                <div class="detail-value">${billing.orderDetails?.orderName || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Order Status:</div>
                <div class="detail-value">${billing.orderDetails?.orderStatus || 'N/A'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Service Type:</div>
                <div class="detail-value">${billing.orderDetails?.serviceType || 'Photography Services'}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Provider:</div>
                <div class="detail-value">${billing.billingOverview?.serviceProvider || 'N/A'}</div>
              </div>
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
                <td>${billing.orderDetails?.serviceType || 'Photography Services'} - ${billing.orderDetails?.orderName || 'Photography Session'}</td>
                <td>${billing.billingOverview?.serviceProvider || 'N/A'}</td>
                <td>$${(billing.billingOverview?.amount || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="invoice-summary">
            <div class="summary-row">
              <div>Subtotal:</div>
              <div>$${(billing.billingOverview?.amount || 0).toFixed(2)}</div>
            </div>
            <div class="summary-row">
              <div>Total Paid:</div>
              <div>$${(billing.transactionSummary?.totalPaid || 0).toFixed(2)}</div>
            </div>
            <div class="summary-row total">
              <div>Amount Due:</div>
              <div>$${(billing.orderDetails?.amountRemaining || 0).toFixed(2)}</div>
            </div>
          </div>
          
          <div class="thank-you">Thank You For Your Business!</div>
          
          <div class="footer">
            <p>If you have any questions regarding this invoice, please contact our support team.</p>
            <p>&copy; ${new Date().getFullYear()} Beige Corporation. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Use html-pdf
    const pdf = require('html-pdf');
    
    return new Promise((resolve, reject) => {
      const options = {
        format: 'A4',
        border: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      };
      
      pdf.create(invoiceHtml, options).toBuffer((err, buffer) => {
        if (err) {
          console.error('PDF generation error:', err);
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`Failed to generate invoice PDF: ${error.message}`);
  }
};

module.exports = {
  getBillings,
  getBillingById,
  generateProfessionalInvoicePDF
};
