/**
 * Dispute Controller
 */

const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { disputeService } = require("../services");

/**
 * Create a dispute
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const createDispute = catchAsync(async (req, res) => {   
  let fileUrls = [];
  const uploadedFileNames = new Set(); // to track duplicates
  
  if (req.files && req.files.length > 0) {
    try {
      const { gcpFileService } = require('../services');
      const folderPath = 'disputes/';
      const { Storage } = require('@google-cloud/storage');
      const config = require('../config/config');
      const storage = new Storage({ keyFilename: config.GCP.keyFilename });
      const bucket = storage.bucket(config.GCP.bucketName);

      for (const file of req.files) {
        const timestamp = Date.now();
        const originalName = file.originalname;

        // Prevent uploading the same file twice
        const uniqueKey = `${originalName}-${file.size}`;
        if (uploadedFileNames.has(uniqueKey)) continue;
        uploadedFileNames.add(uniqueKey);

        const fileName = `${timestamp}-${originalName}`;
        const filePath = `${folderPath}${fileName}`;
        const gcpFile = bucket.file(filePath);

        const stream = gcpFile.createWriteStream({
          metadata: { contentType: file.mimetype },
          resumable: false,
        });

        await new Promise((resolve, reject) => {
          stream.on('error', (err) => {
            reject(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error uploading file: ${err.message}`));
          });

          stream.on('finish', async () => {
            try {
              await gcpFile.makePublic();
              resolve();
            } catch (err) {
              reject(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error making file public: ${err.message}`));
            }
          });

          stream.end(file.buffer);
        });

        const publicUrl = `https://storage.googleapis.com/${config.GCP.bucketName}/${filePath}`;
        fileUrls.push(publicUrl);
      }

      if (fileUrls.length > 0) {
        req.body.fileUrls = fileUrls;
      }
    } catch (error) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error uploading files: ${error.message}`);
    }
  }

  const dispute = await disputeService.createDispute(req.body, fileUrls);
  return res.status(httpStatus.CREATED).json(dispute);
});



/**
 * Get disputes with pagination and sorting options
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getDisputes = catchAsync(async (req, res) => {
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const { client_id } = req.query;
  const result = await disputeService.getDisputes(options, client_id);
  res.json(result);
});

/**
 * Get dispute by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getDisputeById = catchAsync(async (req, res) => {
  const result = await disputeService.getDisputeById(req.params.id);
  res.json(result);
});

/**
 * Get disputes by order ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getDisputesByOrderId = catchAsync(async (req, res) => {
  const result = await disputeService.getDisputeByOrderId(req.params.id);
  res.json(result);
});

const getDisputesByUserId = catchAsync(async (req, res) => {
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
  };

  const result = await disputeService.getDisputesByUserId(
    req.params.id,
    options
  );
  res.json(result);
});

/**
 * Update dispute by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const updateDisputeById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updatedDispute = await disputeService.updateDisputeById(id, req.body);
  res.json(updatedDispute);
});

/**
 * Delete dispute by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const deleteDisputeById = catchAsync(async (req, res) => {
  const { id } = req.params;
  await disputeService.deleteDisputeById(id);
  res.sendStatus(httpStatus.NO_CONTENT);
});

module.exports = {
  createDispute,
  getDisputes,
  getDisputeById,
  getDisputesByOrderId,
  getDisputesByUserId,
  updateDisputeById,
  deleteDisputeById,
};
