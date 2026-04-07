const httpStatus = require("http-status");
const Transaction = require("../models/transaction.model");
const Order = require("../models/order.model");
const Payout = require("../models/payout.model");
const CP = require("../models/cp.model");
const User = require("../models/user.model");
const ApiError = require("../utils/ApiError");

/**
 * Create a transaction record
 * @param {Object} transactionData
 * @returns {Promise<Transaction>}
 */
const createTransaction = async (transactionData) => {
  const transaction = await Transaction.create(transactionData);
  return transaction;
};

/**
 * Create earning transaction when order is completed
 * @param {string} orderId - Order ID
 * @param {string} cpId - Content Provider ID
 * @param {number} amount - Earning amount
 * @returns {Promise<Transaction>}
 */
const createEarningTransaction = async (orderId, cpId, amount) => {
  const order = await Order.findById(orderId).populate("client_id");

  const transactionData = {
    type: "earning",
    userId: cpId,
    amount: amount,
    status: "completed",
    orderId: orderId,
    shootName: order?.order_name || "Untitled Shoot",
    clientId: order?.client_id?._id || null,
    clientName: order?.client_id?.name || order?.guest_info?.name || "Unknown Client",
    transactionDate: new Date(),
    description: `Earnings from ${order?.order_name || "order"}`,
  };

  return await createTransaction(transactionData);
};

/**
 * Create withdrawal transaction when payout is requested/paid
 * @param {string} payoutId - Payout ID
 * @returns {Promise<Transaction>}
 */
const createWithdrawalTransaction = async (payoutId) => {
  const payout = await Payout.findById(payoutId);

  if (!payout) {
    throw new ApiError(httpStatus.NOT_FOUND, "Payout not found");
  }

  const transactionData = {
    type: "withdrawal",
    userId: payout.userId,
    amount: payout.withdrawAmount,
    status: payout.status === "paid" ? "completed" : payout.status === "canceled" ? "cancelled" : "pending",
    payoutId: payoutId,
    invoiceId: payout.invoiceId || null,
    transactionId: payout.transactionId || null,
    paymentMethod: payout.paymentMethod || payout.accountType,
    transactionDate: payout.paymentDate || payout.date || new Date(),
    description: `Withdrawal to ${payout.accountType}`,
  };

  return await createTransaction(transactionData);
};

/**
 * Create payment transaction when client pays for order
 * @param {string} orderId - Order ID
 * @param {number} amount - Payment amount
 * @param {string} paymentIntentId - Payment intent ID
 * @returns {Promise<Transaction>}
 */
const createPaymentTransaction = async (orderId, amount, paymentIntentId) => {
  const order = await Order.findById(orderId).populate("client_id");

  const transactionData = {
    type: "payment",
    userId: order?.client_id?._id || null,
    amount: amount,
    status: "completed",
    orderId: orderId,
    shootName: order?.order_name || "Untitled Shoot",
    paymentIntentId: paymentIntentId || null,
    transactionDate: new Date(),
    description: `Payment for ${order?.order_name || "order"}`,
  };

  return await createTransaction(transactionData);
};

/**
 * Get transactions for a user (CP or Client)
 * @param {string} userId - User ID
 * @param {Object} filter - Additional filters (type, status, dateFrom, dateTo)
 * @param {Object} options - Query options (sortBy, limit, page)
 * @returns {Promise<QueryResult>}
 */
const getUserTransactions = async (userId, filter = {}, options = {}) => {
  const query = { userId };

  // Apply filters
  if (filter.type) {
    query.type = filter.type;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  if (filter.dateFrom || filter.dateTo) {
    query.transactionDate = {};
    if (filter.dateFrom) {
      query.transactionDate.$gte = new Date(filter.dateFrom);
    }
    if (filter.dateTo) {
      query.transactionDate.$lte = new Date(filter.dateTo);
    }
  }

  // Default options with populate for user data
  const defaultOptions = {
    sortBy: "transactionDate:desc",
    limit: 10,
    page: 1,
    populate: "userId,clientId",
    ...options,
  };

  const transactions = await Transaction.paginate(query, defaultOptions);
  return transactions;
};

/**
 * Get all transactions (Admin view)
 * @param {Object} filter - Filters (userId, type, status, dateFrom, dateTo)
 * @param {Object} options - Query options (sortBy, limit, page)
 * @returns {Promise<QueryResult>}
 */
const getAllTransactions = async (filter = {}, options = {}) => {
  const query = {};

  // Apply filters
  if (filter.userId) {
    query.userId = filter.userId;
  }

  if (filter.type) {
    query.type = filter.type;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  if (filter.dateFrom || filter.dateTo) {
    query.transactionDate = {};
    if (filter.dateFrom) {
      query.transactionDate.$gte = new Date(filter.dateFrom);
    }
    if (filter.dateTo) {
      query.transactionDate.$lte = new Date(filter.dateTo);
    }
  }

  // Default options
  const defaultOptions = {
    sortBy: "transactionDate:desc",
    limit: 10,
    page: 1,
    populate: "userId,clientId",
    ...options,
  };

  const transactions = await Transaction.paginate(query, defaultOptions);
  return transactions;
};

/**
 * Get transaction summary for a user
 * @param {string} userId - User ID
 * @param {Object} filter - Date filters (dateFrom, dateTo)
 * @returns {Promise<Object>}
 */
const getTransactionSummary = async (userId, filter = {}) => {
  const mongoose = require("mongoose");

  // Validate userId
  if (!userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User ID is required");
  }

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID format");
  }

  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const query = { userId: userObjectId, status: "completed", type: "earning" };

    // Date filter for last month earnings
    if (filter.dateFrom || filter.dateTo) {
      query.transactionDate = {};
      if (filter.dateFrom) {
        const dateFrom = new Date(filter.dateFrom);
        if (isNaN(dateFrom.getTime())) {
          throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dateFrom format");
        }
        query.transactionDate.$gte = dateFrom;
      }
      if (filter.dateTo) {
        const dateTo = new Date(filter.dateTo);
        if (isNaN(dateTo.getTime())) {
          throw new ApiError(httpStatus.BAD_REQUEST, "Invalid dateTo format");
        }
        // Set to end of day
        dateTo.setHours(23, 59, 59, 999);
        query.transactionDate.$lte = dateTo;
      }
    }

    // Get total transactions (all completed earnings)
    const totalEarnings = await Transaction.aggregate([
      {
        $match: {
          userId: userObjectId,
          type: "earning",
          status: "completed"
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get earnings for the filtered period (e.g., last month)
    const periodEarnings = await Transaction.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get current balance from CP model
    const cp = await CP.findOne({ userId: userObjectId });

    // If CP not found, still return 0 values (user might not have CP profile yet)
    return {
      totalTransactions: totalEarnings[0]?.total || 0,
      earningLastMonth: periodEarnings[0]?.total || 0,
      availableBalance: cp?.currentBalance || 0,
    };
  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }
    // Handle MongoDB errors
    if (error.name === "CastError" || error.name === "BSONTypeError") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID format");
    }
    // Handle other errors
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error retrieving transaction summary"
    );
  }
};

/**
 * Get transaction by ID
 * @param {string} transactionId
 * @returns {Promise<Transaction>}
 */
const getTransactionById = async (transactionId) => {
  const transaction = await Transaction.findById(transactionId)
    .populate("userId", "name email")
    .populate("clientId", "name email")
    .populate("orderId")
    .populate("payoutId");

  if (!transaction) {
    throw new ApiError(httpStatus.NOT_FOUND, "Transaction not found");
  }

  return transaction;
};

/**
 * Update transaction status
 * @param {string} transactionId
 * @param {string} status
 * @returns {Promise<Transaction>}
 */
const updateTransactionStatus = async (transactionId, status) => {
  const transaction = await getTransactionById(transactionId);
  transaction.status = status;
  await transaction.save();
  return transaction;
};

/**
 * Delete transaction
 * @param {string} transactionId
 * @returns {Promise<Transaction>}
 */
const deleteTransaction = async (transactionId) => {
  const transaction = await getTransactionById(transactionId);
  await transaction.deleteOne();
  return transaction;
};

/**
 * Export transactions to CSV format
 * @param {string} userId - User ID (optional, for specific user)
 * @param {Object} filter - Filters
 * @returns {Promise<Array>}
 */
const exportTransactions = async (userId, filter = {}) => {
  const query = userId ? { userId } : {};

  // Apply filters
  if (filter.type) {
    query.type = filter.type;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  if (filter.dateFrom || filter.dateTo) {
    query.transactionDate = {};
    if (filter.dateFrom) {
      query.transactionDate.$gte = new Date(filter.dateFrom);
    }
    if (filter.dateTo) {
      query.transactionDate.$lte = new Date(filter.dateTo);
    }
  }

  const transactions = await Transaction.find(query)
    .populate("userId", "name email")
    .populate("clientId", "name email")
    .sort({ transactionDate: -1 });

  return transactions;
};

module.exports = {
  createTransaction,
  createEarningTransaction,
  createWithdrawalTransaction,
  createPaymentTransaction,
  getUserTransactions,
  getAllTransactions,
  getTransactionSummary,
  getTransactionById,
  updateTransactionStatus,
  deleteTransaction,
  exportTransactions,
};
