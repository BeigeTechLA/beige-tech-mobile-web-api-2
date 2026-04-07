const logger = require("../config/logger");

/**
 * Retry a function with exponential backoff for MongoDB write conflicts
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 100)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 2000)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried
 * @returns {Promise<any>} Result of the function
 */
const retryWithBackoff = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 2000,
    shouldRetry = (error) => {
      // Retry on MongoDB write conflicts and transient errors
      return (
        error.code === 112 || // WriteConflict
        error.codeName === "WriteConflict" ||
        error.errorLabels?.includes("TransientTransactionError") ||
        error.message?.includes("Write conflict") ||
        error.message?.includes("TransientTransactionError")
      );
    },
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's not a retryable error or we've exhausted retries
      if (!shouldRetry(error) || attempt === maxRetries) {
        logger.error(`Retry failed after ${attempt + 1} attempts:`, {
          error: error.message,
          code: error.code,
          codeName: error.codeName,
          errorLabels: error.errorLabels,
        });
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        maxDelay
      );

      logger.warn(
        `Retry attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms:`,
        {
          error: error.message,
          code: error.code,
          codeName: error.codeName,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

/**
 * Retry a MongoDB operation with transaction support
 * @param {Function} operation - Operation to retry (should accept session parameter)
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the operation
 */
const retryMongoOperation = async (operation, options = {}) => {
  return retryWithBackoff(async () => {
    const mongoose = require("mongoose");
    const session = await mongoose.startSession();

    try {
      await session.startTransaction();
      const result = await operation(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }, options);
};

/**
 * Retry a simple MongoDB operation without transaction
 * @param {Function} operation - Operation to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the operation
 */
const retrySimpleOperation = async (operation, options = {}) => {
  return retryWithBackoff(operation, options);
};

module.exports = {
  retryWithBackoff,
  retryMongoOperation,
  retrySimpleOperation,
};
