/**
 * Flexible Upload Middleware
 * Handles both multipart/form-data and application/json requests
 * For multipart/form-data: processes file uploads
 * For application/json: passes through for JSON-only requests
 */

const multer = require('multer');
const httpStatus = require('http-status');

// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
    files: 5 // Maximum 5 files
  }
});

/**
 * Flexible upload middleware that handles both file uploads and JSON-only requests
 * @param {string} fieldName - The field name for file uploads
 * @param {number} maxCount - Maximum number of files allowed
 * @returns {Function} Express middleware
 */
const flexibleUpload = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    // Check content type to determine how to handle the request
    const contentType = req.headers['content-type'] || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle as multipart form data with file upload
      upload.array(fieldName, maxCount)(req, res, (err) => {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(httpStatus.BAD_REQUEST).json({
              message: `File size limit exceeded. Maximum size is ${10} MB`
            });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(httpStatus.BAD_REQUEST).json({
              message: `Too many files. Maximum allowed is ${maxCount} files`
            });
          }
          return res.status(httpStatus.BAD_REQUEST).json({
            message: err.message
          });
        }
        
        // If platformLinks is provided as a string (common in multipart/form-data), parse it
        if (req.body.platformLinks && typeof req.body.platformLinks === 'string') {
          try {
            req.body.platformLinks = JSON.parse(req.body.platformLinks);
          } catch (error) {
            return res.status(httpStatus.BAD_REQUEST).json({
              message: 'Invalid platformLinks format. Must be a valid JSON array.'
            });
          }
        }
        
        next();
      });
    } else {
      // Handle as JSON request (no files)
      // Just pass through to the next middleware
      if (!req.body.platformLinks || !Array.isArray(req.body.platformLinks)) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'When not uploading files, platformLinks must be provided as an array'
        });
      }
      
      // Initialize req.files as an empty array to maintain consistent controller logic
      req.files = [];
      next();
    }
  };
};

module.exports = flexibleUpload;
