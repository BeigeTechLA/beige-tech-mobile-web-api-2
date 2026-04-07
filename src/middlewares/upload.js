/**
 * File Upload Middleware
 * Supports both single and multiple file uploads
 */

const multer = require("multer");
const storage = multer.memoryStorage();

// Single file upload middleware (original functionality)
const upload = (fileKey) => multer({ storage }).single(fileKey);

// Multiple files upload middleware
const uploadMultiple = (fileKey, maxCount = 5) => multer({ storage }).array(fileKey, maxCount);

// Export the original middleware function for backward compatibility
module.exports = upload;

// Add the multiple upload function as a property
module.exports.multiple = uploadMultiple;