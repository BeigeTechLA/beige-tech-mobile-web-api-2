/**
 * Wraps an async function to catch errors and pass them to Express error handler
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - The wrapped function
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error("Error caught in catchAsync:", err);
    
    // Check if next is available and is a function
    if (typeof next === 'function') {
      return next(err);
    }
    
    // If no next, check if res is available and is an object with status method
    if (res && typeof res.status === 'function') {
      return res.status(500).json({
        status: "error",
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
    
    // If neither next nor res are available, just log the error
    console.error("Unable to handle error in catchAsync - no response or next handler available");
  });
};

module.exports = catchAsync;
