/**
 * File Controller
 * This module contains the controller functions for handling file-related operations.
 */

const httpStatus = require("http-status");
const { v4: uuidv4 } = require("uuid");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { fileService, orderService } = require("../services");
const gcpFileService = require("../services/gcpFile.service");
const pick = require("../utils/pick");

const createDirectory = catchAsync(async (req, res) => {
  const { target_path, folder_name } = req.body;

  const createdDirectory = await fileService.createDirectory(
    target_path,
    folder_name
  );

  res.status(httpStatus.CREATED).json(createdDirectory);
});

const getDirectoryContents = catchAsync(async (req, res) => {
  const { target_path, keys_only } = req.query;
  const directoryContents = await fileService.listFilesAndFolder(
    target_path,
    keys_only
  );
  res.json(directoryContents);
});

const getOrderFilesAndFolders = catchAsync(async (req, res) => {
  const { order_id } = req.params;
  const { keys_only } = req.query;

  // Validate if the Order ID is valid before proceeding with the file upload
  const orderData = await orderService.checkOrderId(order_id, true);
  const targetPath = `${orderData.order_name} - ${orderData.id}`;
  const listing = await fileService.listFilesAndFolder(targetPath, keys_only);
  res.json(listing);
});

/**
 * Upload Order File
 * Controller function to handle order file upload and upload the file to the AWS S3 bucket.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Object} - JSON response with information about the uploaded file.
 * @throws {ApiError} - If no file is uploaded or if there's an error during file upload.
 */
const uploadOrderFile = catchAsync(async (req, res) => {
  const { order_id, file_type, content_type, shoot_date, privacy } = req.body;

  // Validate the API request parameters
  if (!order_id || !file_type || !content_type || !shoot_date) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Missing required parameters");
  }

  // Validate if the Order ID is valid before proceeding with the file upload
  const orderData = await orderService.checkOrderId(order_id, true);

  // Fetch file object from request
  const uploadedFile = req.file;

  // Check if the file is uploaded
  if (!uploadedFile) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No file uploaded");
  }

  // Generate a unique file name using UUID and the original file extension
  const fileExtension = uploadedFile.originalname.split(".").pop();
  const fileName = uuidv4() + "." + fileExtension;

  // Construct the file key for the AWS S3 bucket
  const fileKey = fileService.constructObjectKey(
    orderData,
    content_type,
    shoot_date,
    file_type,
    fileName
  );

  // Prepare file data with generated file name and S3 file path for storing in the database
  const fileData = req.body;
  fileData.file_name = fileName;
  fileData.file_path = fileKey;

  // Upload the file to the AWS S3 bucket and store file data in the database
  const uploadedFileInfo = await fileService.uploadFile(
    uploadedFile.buffer,
    fileData
  );

  return res.status(httpStatus.CREATED).json(uploadedFileInfo);
});

const uploadPublicFile = catchAsync(async (req, res) => {
  // Fetch file object from request
  const uploadedFile = req.file;

  // Check if the file is uploaded
  if (!uploadedFile) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No file uploaded");
  }

  // Generate a unique file name using UUID and the original file extension
  const fileExtension = uploadedFile.originalname.split(".").pop();
  const fileName = uuidv4() + "." + fileExtension;

  // Prepare file data with generated file name and S3 file path for storing in the database
  const fileData = {};
  fileData.file_name = fileName;
  fileData.file_path = fileName;
  fileData.privacy = "Public";

  // Upload the file to the AWS S3 bucket and store file data in the database
  const uploadedFileInfo = await fileService.uploadFile(
    uploadedFile.buffer,
    fileData
  );

  return res.status(httpStatus.CREATED).json(uploadedFileInfo);
});

/**
 * Get Order Files
 * Controller function to retrieve files associated with a specific order.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Object} - JSON response with files associated with the order.
 * @throws {ApiError} - If there's an error while retrieving the files or if the order ID is invalid.
 */
const getOrderFiles = catchAsync(async (req, res) => {
  const { order_id } = req.params;

  // Validate if the Order ID is valid before proceeding with the file retrieval
  await orderService.checkOrderId(order_id, true);

  // Extract query parameters for sorting, pagination, etc.
  const options = pick(req.query, ["sortBy", "limit", "page"]);

  const filter = pick(req.query, ["content_type", "file_type"]);

  //Set order ID to the filter object
  filter.order_id = order_id;

  // Retrieve files associated with the order using the provided options
  const result = await fileService.getFilesByOrderId(filter, options);

  // Send the files associated with the order as a JSON response
  res.send(result);
});

/**
 * Delete Order File
 * Controller function to handle order file deletion from AWS S3 bucket.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Object} - JSON response with information about the deletion status.
 * @throws {ApiError} - If there's an error during file deletion.
 */
const deleteOrderFile = catchAsync(async (req, res) => {
  const { order_id, file_id } = req.params;

  // Get file record by order ID and file ID
  const fileRecord = await fileService.getOrderFile(order_id, file_id);

  // Delete the file from the AWS S3 bucket
  await fileService.deleteFile(fileRecord.id, fileRecord.file_path);

  // Send a successful response
  res.sendStatus(httpStatus.NO_CONTENT);
});

/**
 * Get Private File Download URL
 * Controller function to get the private download URL for a file stored in AWS S3.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Object} - JSON response with the private download URL.
 * @throws {ApiError} - If there's an error while generating the URL or if the file is not found.
 */
const getPrivateFileDownloadURL = catchAsync(async (req, res) => {
  const { file_id } = req.params;

  // Get the private download URL for the specified file ID
  const downloadURL = await fileService.getPrivateFileDownloadURL(file_id);

  // Send the private download URL as a JSON response
  res.json({ download_url: downloadURL });
});

const updateReviewStatusByPath = catchAsync(async (req, res) => {
  const { file_path, review_status } = req.body;
  const updatedStatus = await fileService.updateReviewStatus(
    file_path,
    review_status,
    "path"
  );
  res.json(updatedStatus);
});

const updateReviewStatusById = catchAsync(async (req, res) => {
  const { file_id, review_status } = req.body;
  const updatedStatus = await fileService.updateReviewStatus(
    file_id,
    review_status,
    "id"
  );
  res.json(updatedStatus);
});

/**
 * Start of resumable upload API handlers
 **/

/**
 * Get file data by fileId.
 *
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {void}
 */
const getFileData = catchAsync(async (req, res) => {
  const { fileId } = req.query;
  const fileData = await fileService.getFileData(fileId);
  res.json(fileData);
});

/**
 * Initiates an upload request for a file.
 *
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @throws {ApiError} If file name and extension are missing or the file extension is unsupported.
 */
const initiateUploadRequest = catchAsync(async (req, res) => {

  // Define allowed file extensions
  const allowedFileExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".tiff",
    ".raw",
    ".nef",
    ".cr2",
    ".arw",
    ".orf",
    ".dng",
    ".bmp",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".mpg",
    ".mpeg",
    ".wmv",
    ".flv",
    ".gif",
    ".ogg",
    ".3gp",
  ];

  let { fileName, fileExt, orderId, shootDate, contentType, fileType } = req.body;

  if (!fileName || !fileExt || !orderId || !shootDate || !contentType || !fileType) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Missing required parameters");
  }

  // Validate if the Order ID is valid before proceeding with the file upload
  const orderData = await orderService.checkOrderId(orderId, true);

  // Convert fileExt to lowercase
  fileExt = fileExt.toLowerCase();

  // Check if fileExt is in the allowed file extensions
  if (!allowedFileExtensions.includes(fileExt)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Unsupported file extension");
  }

  // Generate a unique file name using UUID and the original file extension
  const generatedFileName = uuidv4() + fileExt;

  // Construct the file key for the AWS S3 bucket
  const fileKey = fileService.constructObjectKey(
    orderData,
    contentType,
    shootDate,
    fileType,
    generatedFileName
  );

  // Initiate the upload request
  const initiatedFileData = await fileService.initiateUploadRequest(
    fileName,
    generatedFileName,
    fileExt,
    fileKey
  );

  res.json(initiatedFileData);
});

/**
 * Upload a chunk of a file.
 *
 * This controller handles the request to upload a chunk of a file, verifies required request headers
 * and query parameters, and delegates the chunk upload operation to the file service.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @throws {ApiError} If the request headers or query parameters are invalid.
 * @returns {Object} The response JSON containing file data.
 */
const uploadFileChunk = catchAsync(async (req, res) => {
  // Fetch required request headers and query parameters
  const contentRange = req.headers["content-range"];
  const fileId = req.headers["x-file-id"];

  // Validate the request headers and query parameters
  if (!contentRange || !fileId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid request headers");
  }

  const fileData = await fileService.uploadFileChunk(req, contentRange, fileId);
  res.json(fileData);
});

/**
 * End of resumable upload API handlers
 **/

/**
 * Check Upload Permission
 * Controller function to check if user can upload to a specific folder based on folder type and role.
 * @param {Object} req - Express request object with folderPath in body and user in req.user
 * @param {Object} res - Express response object.
 * @returns {Object} - JSON response with canUpload boolean and reason.
 */
const checkUploadPermission = catchAsync(async (req, res) => {
  const { folderPath } = req.body;

  if (!folderPath) {
    throw new ApiError(httpStatus.BAD_REQUEST, "folderPath is required");
  }

  const role = req.user?.role || 'user';
  const result = await gcpFileService.checkUploadPermission(folderPath, role);

  res.json({
    success: true,
    ...result
  });
});

/**
 * Get Folder Permissions
 * Controller function to get visibility and upload permissions for a folder based on role.
 * @param {Object} req - Express request object with folderPath in query and user in req.user
 * @param {Object} res - Express response object.
 * @returns {Object} - JSON response with folder permissions info.
 */
const getFolderPermissions = catchAsync(async (req, res) => {
  const { folderPath } = req.query;

  if (!folderPath) {
    throw new ApiError(httpStatus.BAD_REQUEST, "folderPath query parameter is required");
  }

  const role = req.user?.role || 'user';
  const result = await gcpFileService.getFolderPermissions(folderPath, role);

  res.json({
    success: true,
    ...result
  });
});

module.exports = {
  createDirectory,
  getDirectoryContents,
  getOrderFilesAndFolders,
  uploadOrderFile,
  uploadPublicFile,
  getOrderFiles,
  deleteOrderFile,
  getPrivateFileDownloadURL,
  updateReviewStatusByPath,
  updateReviewStatusById,
  getFileData,
  initiateUploadRequest,
  uploadFileChunk,
  checkUploadPermission,
  getFolderPermissions,
};
