const express = require("express");
const auth = require("../../middlewares/auth");
const transactionController = require("../../controllers/transaction.controller");

const router = express.Router();

/**
 * @route   GET /api/v1/transactions/my-transactions
 * @desc    Get logged-in user's transactions (CP or Client)
 * @access  Private (authenticated users)
 */
router.get("/my-transactions", auth(), transactionController.getMyTransactions);

/**
 * @route   GET /api/v1/transactions/summary
 * @desc    Get transaction summary for logged-in user
 * @access  Private (authenticated users)
 */
router.get("/summary", auth(), transactionController.getMyTransactionSummary);

/**
 * @route   GET /api/v1/transactions/export
 * @desc    Export transactions to CSV
 * @access  Private (authenticated users)
 */
router.get("/export", auth(), transactionController.exportTransactions);

/**
 * @route   GET /api/v1/transactions
 * @desc    Get all transactions (Admin only)
 * @access  Private (admin)
 */
router.get("/", auth("manageUsers"), transactionController.getAllTransactions);

/**
 * @route   POST /api/v1/transactions
 * @desc    Create a transaction manually (Admin only)
 * @access  Private (admin)
 */
router.post("/", auth("manageUsers"), transactionController.createTransaction);

/**
 * @route   GET /api/v1/transactions/user/:userId
 * @desc    Get transactions for a specific user (Admin only)
 * @access  Private (admin)
 */
router.get("/user/:userId", auth("manageUsers"), transactionController.getUserTransactions);

/**
 * @route   GET /api/v1/transactions/summary/:userId
 * @desc    Get transaction summary for a specific user (Admin only)
 * @access  Private (admin)
 */
router.get("/summary/:userId", auth("manageUsers"), transactionController.getUserTransactionSummary);

/**
 * @route   GET /api/v1/transactions/:transactionId
 * @desc    Get transaction by ID
 * @access  Private (authenticated users)
 */
router.get("/:transactionId", auth(), transactionController.getTransaction);

/**
 * @route   PATCH /api/v1/transactions/:transactionId
 * @desc    Update transaction status (Admin only)
 * @access  Private (admin)
 */
router.patch("/:transactionId", auth("manageUsers"), transactionController.updateTransaction);

/**
 * @route   DELETE /api/v1/transactions/:transactionId
 * @desc    Delete transaction (Admin only)
 * @access  Private (admin)
 */
router.delete("/:transactionId", auth("manageUsers"), transactionController.deleteTransaction);

module.exports = router;
