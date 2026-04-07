const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const quotationSchema = mongoose.Schema(
  {
    quotation_number: {
      type: String,
      required: true,
      unique: true,
    },
    leadId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Order',
      index: true,
    },
    order_title: {
      type: String,
      required: true,
      trim: true,
    },
    original_price: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_type: {
      type: String,
      enum: ['flat', 'percentage', 'none'],
      default: 'none',
    },
    discount_value: {
      type: Number,
      default: 0,
      min: 0,
    },
    final_price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
    notes: {
      type: String,
      trim: true,
    },
    expiry_date: {
      type: Date,
      required: true,
    },
    email_sent: {
      type: Boolean,
      default: false,
    },
    email_sent_at: {
      type: Date,
    },
    accepted_at: {
      type: Date,
    },
    rejected_at: {
      type: Date,
    },
    payment_link_sent: {
      type: Boolean,
      default: false,
    },
    payment_link_sent_at: {
      type: Date,
    },
    created_by: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
    updated_by: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Add plugin that converts mongoose to json
quotationSchema.plugin(toJSON);
quotationSchema.plugin(paginate);

/**
 * Check if quotation number is already taken
 * @param {string} quotationNumber - The quotation's number
 * @param {ObjectId} [excludeQuotationId] - The id of the quotation to be excluded
 * @returns {Promise<boolean>}
 */
quotationSchema.statics.isQuotationNumberTaken = async function (quotationNumber, excludeQuotationId) {
  const quotation = await this.findOne({ quotation_number: quotationNumber, _id: { $ne: excludeQuotationId } });
  return !!quotation;
};

/**
 * Generate a unique quotation number
 * Format: QT-YYYYMMDD-XXXX (where XXXX is a sequential number)
 * @returns {Promise<string>}
 */
quotationSchema.statics.generateQuotationNumber = async function () {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `QT-${dateStr}-`;
  
  // Find the highest existing number with today's prefix
  const highestQuotation = await this.findOne(
    { quotation_number: { $regex: `^${prefix}` } },
    { quotation_number: 1 },
    { sort: { quotation_number: -1 } }
  );
  
  let sequentialNumber = 1;
  if (highestQuotation) {
    const currentNumber = parseInt(highestQuotation.quotation_number.split('-')[2], 10);
    sequentialNumber = currentNumber + 1;
  }
  
  // Pad the sequential number to 4 digits
  const paddedNumber = sequentialNumber.toString().padStart(4, '0');
  return `${prefix}${paddedNumber}`;
};

/**
 * Calculate final price based on discount type and value
 * @param {number} originalPrice - The original price
 * @param {string} discountType - The type of discount ('flat', 'percentage', 'none')
 * @param {number} discountValue - The discount value
 * @returns {number} The final price after discount
 */
quotationSchema.statics.calculateFinalPrice = function (originalPrice, discountType, discountValue) {
  // Convert inputs to numbers to ensure proper calculation
  originalPrice = Number(originalPrice);
  discountValue = Number(discountValue);

  // Validate inputs
  if (isNaN(originalPrice) || originalPrice <= 0) {
    return 0;
  }

  if (!discountType || discountType === 'none' || isNaN(discountValue) || discountValue <= 0) {
    return originalPrice;
  }

  let finalPrice = originalPrice;
  
  if (discountType === 'flat') {
    finalPrice = Math.max(0, originalPrice - discountValue);
  } else if (discountType === 'percentage') {
    // Ensure percentage is between 0 and 100
    const safePercentage = Math.min(100, Math.max(0, discountValue));
    finalPrice = originalPrice * (1 - safePercentage / 100);
  }

  // Round to 2 decimal places to avoid floating point issues
  return Math.round(finalPrice * 100) / 100;
};

/**
 * Find all quotations by lead ID
 * @param {ObjectId} leadId - The lead ID to search for
 * @returns {Promise<Array<Quotation>>}
 */
quotationSchema.statics.findByLeadId = async function (leadId) {
  return this.find({ leadId, is_deleted: false })
    .sort({ createdAt: -1 })
    .populate([
      { path: 'leadId', select: 'status contact.name company.name email' },
      { path: 'orderId', select: 'order_number status' },
      { path: 'created_by', select: 'name email' },
    ]);
};

/**
 * @typedef Quotation
 */
const Quotation = mongoose.model('Quotation', quotationSchema);

module.exports = Quotation;
