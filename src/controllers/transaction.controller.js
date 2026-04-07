const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const transactionService = require("../services/transaction.service");
const pick = require("../utils/pick");

/**
 * Get user's own transactions (CP or Client)
 * GET /api/v1/transactions/my-transactions
 */
const getMyTransactions = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const filter = pick(req.query, ["type", "status", "dateFrom", "dateTo"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  // Get transactions
  const result = await transactionService.getUserTransactions(userId, filter, options);

  // Get summary (for last month earnings calculation)
  const now = new Date();
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const summaryFilter = {
    dateFrom: req.query.dateFrom || firstDayLastMonth,
    dateTo: req.query.dateTo || lastDayLastMonth,
  };

  const summary = await transactionService.getTransactionSummary(userId, summaryFilter);

  // Merge transactions and summary
  const response = {
    ...result,
    totalTransactions: summary.totalTransactions,
    earningLastMonth: summary.earningLastMonth,
    availableBalance: summary.availableBalance,
  };

  res.status(httpStatus.OK).send(response);
});

/**
 * Get all transactions (Admin only)
 * GET /api/v1/transactions
 */
const getAllTransactions = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["userId", "type", "status", "dateFrom", "dateTo"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  const result = await transactionService.getAllTransactions(filter, options);

  res.status(httpStatus.OK).send(result);
});

/**
 * Get transactions for a specific user (Admin only)
 * GET /api/v1/transactions/user/:userId
 */
const getUserTransactions = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const filter = pick(req.query, ["type", "status", "dateFrom", "dateTo"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  const result = await transactionService.getUserTransactions(userId, filter, options);

  res.status(httpStatus.OK).send(result);
});

/**
 * Get transaction summary for logged-in user
 * GET /api/v1/transactions/summary
 */
const getMyTransactionSummary = catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Get last month's date range
  const now = new Date();
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const filter = {
    dateFrom: req.query.dateFrom || firstDayLastMonth,
    dateTo: req.query.dateTo || lastDayLastMonth,
  };

  const summary = await transactionService.getTransactionSummary(userId, filter);

  res.status(httpStatus.OK).send(summary);
});

/**
 * Get transaction summary for a specific user (Admin only)
 * GET /api/v1/transactions/summary/:userId
 */
const getUserTransactionSummary = catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Get last month's date range
  const now = new Date();
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const filter = {
    dateFrom: req.query.dateFrom || firstDayLastMonth,
    dateTo: req.query.dateTo || lastDayLastMonth,
  };

  const summary = await transactionService.getTransactionSummary(userId, filter);

  res.status(httpStatus.OK).send(summary);
});

/**
 * Get transaction by ID
 * GET /api/v1/transactions/:transactionId
 */
const getTransaction = catchAsync(async (req, res) => {
  const transaction = await transactionService.getTransactionById(req.params.transactionId);

  res.status(httpStatus.OK).send(transaction);
});

/**
 * Create a transaction manually (Admin only - for corrections/adjustments)
 * POST /api/v1/transactions
 */
const createTransaction = catchAsync(async (req, res) => {
  const transaction = await transactionService.createTransaction(req.body);

  res.status(httpStatus.CREATED).send(transaction);
});

/**
 * Update transaction status (Admin only)
 * PATCH /api/v1/transactions/:transactionId
 */
const updateTransaction = catchAsync(async (req, res) => {
  const transaction = await transactionService.updateTransactionStatus(
    req.params.transactionId,
    req.body.status
  );

  res.status(httpStatus.OK).send(transaction);
});

/**
 * Delete transaction (Admin only)
 * DELETE /api/v1/transactions/:transactionId
 */
const deleteTransaction = catchAsync(async (req, res) => {
  await transactionService.deleteTransaction(req.params.transactionId);

  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Export transactions to CSV
 * GET /api/v1/transactions/export
 */
const exportTransactions = catchAsync(async (req, res) => {
  const userId = req.user.role === "admin" ? req.query.userId : req.user.id;
  const filter = pick(req.query, ["type", "status", "dateFrom", "dateTo"]);

  const transactions = await transactionService.exportTransactions(userId, filter);

  // Convert to CSV format
  const csvHeaders = "Date,Shoot,Client,Amount,Type,Status\n";
  const csvRows = transactions
    .map((t) => {
      const date = new Date(t.transactionDate).toLocaleDateString();
      const shoot = t.shootName || "-";
      const client = t.clientName || "-";
      const amount = `$${t.amount}`;
      const type = t.type;
      const status = t.status;
      return `${date},${shoot},${client},${amount},${type},${status}`;
    })
    .join("\n");

  const csv = csvHeaders + csvRows;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=transactions.csv");
  res.status(httpStatus.OK).send(csv);
});

module.exports = {
  getMyTransactions,
  getAllTransactions,
  getUserTransactions,
  getMyTransactionSummary,
  getUserTransactionSummary,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  exportTransactions,
};
