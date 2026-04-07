/**
 * File Service
 * This module contains the service functions for handling file-related operations using AWS S3.
 */

const httpStatus = require("http-status");
const { format } = require("date-fns");
const { File, ChatMessage } = require("../models");
const stream = require("stream");
const ApiError = require("../utils/ApiError");
const { s3Config, s3 } = require("../utils/Aws");
const logger = require("../config/logger");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const Busboy = require("busboy");

// Promisify the fs.stat function to get file information
const getFileDetails = promisify(fs.stat);

//Start general purpose file API handler service functions

/**
 * Converts a flat list of S3 object keys and their metadata into a nested directory structure.
 *
 * @param {Array} list - The list of S3 object keys with metadata.
 * @returns {Object} - A nested structure representing the directory and file hierarchy.
 */
const convertToNestedStructure = (list) => {
  const result = {};

  list.forEach((item) => {
    const parts = item.key.split("/");
    let current = result;
    let path = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      path += part + "/";

      if (!current[part]) {
        current[part] = {
          type: i === parts.length - 1 ? "file" : "directory",
          path: path,
        };

        // Add metadata and size to file items
        if (i === parts.length - 1) {
          current[part].metaData = item.metaData || {};
          current[part].size = item.size || 0;
          current[part].lastModified = item.lastModified || null;
        }

        if (i !== parts.length - 1) {
          current[part].items = {};
        }
      }
 
      current = current[part].items;
    }
  });

  return result;
};

/**
 * Create a new directory in the AWS S3 bucket.
 *
 * @returns {Promise<Object>} - A Promise that resolves to the result of the directory creation operation in AWS S3.
 * @throws {ApiError} - If there is an error during the directory creation process, an ApiError with INTERNAL_SERVER_ERROR status code will be thrown.
 * @param targetPath
 * @param directoryName
 */
const createDirectory = async (targetPath, directoryName) => {
  try {
    // Normalize the path with a trailing slash
    const normalizedTargetPath = targetPath.endsWith("/")
      ? targetPath
      : `${targetPath}/`;

    const normalizedDirectoryName = directoryName.endsWith("/")
      ? directoryName
      : `${directoryName}/`;

    const normalizedPath = normalizedTargetPath + normalizedDirectoryName;

    const params = {
      Bucket: s3Config.bucketName,
      Key: normalizedPath,
    };

    // Call the putObject method with an empty Body to create a directory
    return await s3.putObject(params).promise();
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Lists files and folders in an S3 bucket path and retrieves metadata for each object.
 *
 * @param {string} targetPath - The S3 bucket path to list objects from.
 * @param {string} nested - Specify "1" to return a nested structure, otherwise return raw data.
 * @returns {Object} - An object containing a list of objects and their metadata.
 * @throws {ApiError} - Throws an error if the S3 operation fails.
 */
const listFilesAndFolder = async (targetPath, nested = "1") => {
  // Ensure the path ends with a '/'
  const normalizedPath = targetPath.endsWith("/")
    ? targetPath
    : `${targetPath}/`;

  const params = {
    Bucket: s3Config.bucketName,
    Prefix: normalizedPath,
  };

  try {
    // List objects in the specified S3 path
    const data = await s3.listObjectsV2(params).promise();
    const keys = data.Contents.map((item) => item.Key);

    // Fetch metadata for each object using parallel promises
    const objectsWithMetadata = await Promise.all(
      keys.map(async (key) => {
        const headParams = {
          Bucket: s3Config.bucketName,
          Key: key,
        };

        try {
          const headData = await s3.headObject(headParams).promise();
          return {
            key: key,
            metaData: headData.Metadata,
            size: headData.ContentLength,
            lastModified: headData.LastModified,
          };
        } catch (error) {
          console.error(`Error fetching metadata for ${key}: ${error.message}`);
          return {
            key: key,
            metadata: {}, // Return an empty object if metadata fetch fails
            size: 0,
          };
        }
      })
    );

    // Return the data in nested structure or raw data based on the 'nested' parameter
    return nested === "1"
      ? convertToNestedStructure(objectsWithMetadata)
      : data;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

//End general purpose file API handler service functions

/**
 * Get a file record by fileId
 *
 * @param {string} fileId - The ID of the file to retrieve.
 * @returns {Promise<object>} A promise that resolves to the file record if found.
 * @throws {ApiError} If the file is not found.
 */
const getFileRecord = async (fileId) => {
  try {
    const fileRecord = await File.findById(fileId);
    if (!fileRecord) {
      throw new ApiError(httpStatus.NOT_FOUND, "File not found");
    }
    return fileRecord;
  } catch (error) {
    throw error;
  }
};

/**
 * Upload File
 * Service function to upload a file to AWS S3 bucket.
 * @param {Buffer} buffer - The file data as a buffer.
 * @param {Object} fileData - Metadata related to the file to be stored in the database.
 * @returns {Promise<Object>} - A Promise that resolves to information about the uploaded file from AWS S3.
 * @throws {ApiError} - If there's an error during file upload to the S3 bucket.
 */
const uploadFile = async (buffer, fileData) => {
  return new Promise((resolve, reject) => {
    const privacy = fileData.privacy;
    const passThroughStream = new stream.PassThrough();
    const bucket =
      privacy === "Private" ? s3Config.bucketName : s3Config.publicBucketName;

    const params = {
      Bucket: bucket,
      Key: fileData.file_path, // Construct the full file path in the S3 bucket
      Body: passThroughStream, // The file data (Buffer, ReadableStream, or Blob)
    };
 
    if (privacy !== "Public") {
      params.Metadata = {
        review_status: "Pending",
      };
    }

    s3.upload(params, async (err, data) => {
      if (err) {
        reject(err);
      } else {
        //Set Download URL property for public file
        if (privacy === "Public") {
          fileData.download_url = data.Location;
        }
        const fileRecord = await File.create(fileData);
        resolve(fileRecord);
      }
    });

    // Create a readable stream using the buffer data
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    // Pipe the buffer stream to the pass stream
    bufferStream.pipe(passThroughStream);

    bufferStream.on("error", (err) => {
      reject(err);
    });
  });
};

/**
 * Get Files By Order ID
 * Service function to retrieve files associated with a specific order using pagination and filtering options.
 * @param {Object} options - Query options for sorting, pagination, etc.
 * @param {Object} filter - Filter object to apply filtering conditions for files retrieval.
 * @returns {Promise<Object>} A Promise that resolves to the paginated result of files associated with the order.
 * @throws {ApiError} If there's an error while retrieving the files or processing the request.
 */
const getFilesByOrderId = async (filter, options) => {
  try {
    return await File.paginate(filter, options);
  } catch (error) {
    // If there's an error during the retrieval process, throw an ApiError with an INTERNAL_SERVER_ERROR status code.
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Delete a folder or files from the AWS S3 bucket.
 *
 * @param {string} pathToDelete - The path of the folder or file(s) to be deleted in the S3 bucket.
 * @returns {Promise<Object>} - A Promise that resolves to the result of the deletion operation in AWS S3.
 * @throws {ApiError} - If there is an error during the deletion process, an ApiError with INTERNAL_SERVER_ERROR status code will be thrown.
 */
const deleteFileAndFolder = async (pathToDelete) => {
  try {
    // Normalize the path with a trailing slash
    const normalizedPath = pathToDelete.endsWith("/")
      ? pathToDelete
      : `${pathToDelete}/`;

    const params = {
      Bucket: s3Config.bucketName,
      Key: normalizedPath,
    };

    // Call the deleteObject method to delete the folder or files
    return await s3.deleteObject(params).promise();
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Delete a file from the AWS S3 bucket and its record from the database.
 *
 * @param {string} fileId - The ID of the file to delete.
 * @param {string} filePath - The path of the file in the S3 bucket to delete.
 * @throws {ApiError} - If there is an error during the deletion process, an ApiError with INTERNAL_SERVER_ERROR status code will be thrown.
 */
const deleteFile = async (fileId, filePath) => {
  try {
    const params = {
      Bucket: s3Config.bucketName,
      Key: filePath,
    };

    // Call the deleteObject method to delete the file
    await s3.deleteObject(params).promise();

    // Delete the file record from the database
    await File.findByIdAndDelete(fileId);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get a file record from the database by its ID and order ID.
 *
 * @param {string} orderId - The order ID to which the file belongs.
 * @param {string} fileId - The ID of the file to retrieve.
 * @returns {Promise<File>} - A Promise that resolves to the retrieved file record.
 * @throws {ApiError} - If the file record is not found, an ApiError with BAD_REQUEST status code will be thrown.
 */
const getOrderFile = async (orderId, fileId) => {
  try {
    const fileRecord = await File.findOne({
      _id: fileId,
      order_id: orderId,
    });
    if (!fileRecord) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid object ID");
    }
    return fileRecord;
  } catch (error) {
    throw error;
  }
};

/**
 * Get AWS S3 Private Download URL for a File
 * Service function to generate a private download URL for a file stored in AWS S3.
 * @param {string} fileId - The ID of the file to generate the URL for.
 * @returns {Promise<string>} - A Promise that resolves to the generated private download URL.
 * @throws {ApiError} - If there's an error while generating the URL.
 */
const getPrivateFileDownloadURL = async (fileId) => {
  try {
    // Retrieve the file record from the database using the file ID
    const fileRecord = await getFileRecord(fileId);
    // Generate a signed URL with a short expiration time for private download
    const params = {
      Bucket: s3Config.bucketName,
      Key: fileRecord.file_path,
      Expires: s3Config.privateFileDownloadUrlExpirationTime, // URL expiration time in seconds (1 hour)
    };

    // Generate the private download URL using the AWS SDK
    return await s3.getSignedUrlPromise("getObject", params);
  } catch (error) {
    throw error;
  }
};

/**
 * Helper function to construct the object key for S3 upload.
 * @param orderData
 * @param {string} contentType - The content type (e.g., Photo, Video).
 * @param {string} shootDate - The shoot date of the content.
 * @param {string} fileType - The file type (e.g., Raw, Edited).
 * @param {string} fileName - The name of the file.
 * @returns {string} - The constructed object key.
 */
const constructObjectKey = (
  orderData,
  contentType,
  shootDate,
  fileType,
  fileName
) => {
  const formattedDate = format(new Date(shootDate), "do MMM yyyy");
  return `${orderData.id}/${formattedDate}/${contentType}/${fileType}/${fileName}`;
};

const updateReviewStatus = async (fileRef, reviewStatus, refType) => {
  try {
    // Find the file by either file path or file ID
    let file;
    if (refType === "path") {
      // If reference type is path
      file = await File.findOne({ file_path: fileRef });
    } else if (refType === "id") {
      // If reference type is ID
      file = await getFileRecord(fileRef);
    }

    if (!file) {
      throw new ApiError(httpStatus.NOT_FOUND, "File not found");
    }

    // Prepare the parameters for the copy operation
    const params = {
      Bucket: s3Config.bucketName,
      CopySource: `${s3Config.bucketName}/${file.file_path}`, // Copy from the same object
      Key: file.file_path, // Destination key (same as source)
      MetadataDirective: "REPLACE", // Replace existing metadata
      Metadata: {
        review_status: reviewStatus,
      },
    };

    // Perform the copy operation
    await s3.copyObject(params).promise();

    // Update the review status in the file record in the database
    file.review_status = reviewStatus;
    await file.save();

    return file;
  } catch (error) {
    throw error;
  }
};

/**
 * Start of resumable upload API service functions
 **/

/**
 * Get the local file path for the generated file name
 *
 * @param {string} generatedFileName - The generated file name
 * @returns {string} The local file path
 */
const getLocalFilePath = (generatedFileName) => {
  const uploadsDir = path.join(__dirname, "..", "..", "uploads"); // Adjust the path as needed
  return path.join(uploadsDir, generatedFileName);
};

const transferFileToS3 = async (fileData) => {
  return new Promise((resolve, reject) => {
    //Create a read stream to read the file
    const readStream = fs.createReadStream(fileData.local_path);

    //Define s3 upload parameters
    const params = {
      Bucket: s3Config.bucketName,
      Key: fileData.file_path, // Construct the full file path in the S3 bucket
      Body: readStream, // The file data (Buffer, ReadableStream, or Blob)
      Metadata: {
        file_name: fileData.original_name,
        review_status: "Pending",
        file_id: fileData.id
      },
    };

    //Upload the file to the AWS S3 bucket
    s3.upload(params, async (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

/**
 * Get file data by fileId
 *
 * @param {string} fileId - The ID of the file to retrieve data for
 * @returns {Promise<object>} A promise that resolves to the file data if found and updated
 * @throws {ApiError} If the file is not found or if there's an error updating the file size
 */
const getFileData = async (fileId) => {
  try {
    // Fetch file record and file stat
    const fileRecord = await getFileRecord(fileId);
    const fileStat = await getFileDetails(fileRecord.local_path);

    // Update file size in the database if the file size is updated
    if (Number(fileStat.size !== Number(fileRecord.size))) {
      fileRecord.size = fileStat.size;
      await fileRecord.save();
    }

    // Prepare file data
    const { _id, __v, ...fileData } = fileRecord.toObject();
    fileData.id = _id;

    // Delete local path property and return the file record
    delete fileData.local_path;
    return fileData;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error);
  }
};

/**
 * Initiates an upload request for a file
 *
 * @param {string} fileName - The original name of the file
 * @param {string} generatedFileName - The generated unique file name
 * @param {string} fileExt - The file extension
 * @returns {Promise<Object>} The file record data
 */
const initiateUploadRequest = async (
  fileName,
  generatedFileName,
  fileExt,
  fileKey
) => {
  try {
    // Generate local file path
    const localFilePath = getLocalFilePath(generatedFileName);
    // Create a write stream to save the file chunk
    fs.createWriteStream(localFilePath);

    // Prepare file record data
    const fileData = {
      original_name: fileName,
      file_name: generatedFileName,
      file_path: fileKey,
      local_path: localFilePath,
      file_extension: fileExt,
      privacy: "Private",
      status: "Pending",
    };

    // Create file record in the database
    const fileRecord = await File.create(fileData);

    // Prepare response data
    const { _id, __v, ...responseData } = fileRecord.toObject();
    responseData.id = _id;

    // Delete local path property and return the file record
    delete responseData.local_path;
    return responseData;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error);
  }
};

/**
 * Uploads a chunk of a file to the server and performs additional processing.
 *
 * This function handles the upload of a file chunk, validates the content range header,
 * and saves the chunk to the local file. It then initiates the transfer of the complete
 * file to an S3 bucket, updates the file's status and size in the database, and deletes
 * the local file.
 *
 * @param {Object} req - The request object.
 * @param {string} contentRange - The 'content-range' header indicating the range of bytes in the chunk.
 * @param {string} fileId - The unique identifier for the file.
 * @throws {ApiError} If the content range header is invalid or if there are errors during the upload.
 * @returns {Object} The file data including updated status and size.
 */
const uploadFileChunk = async (req, contentRange, fileId) => {
  // Fetch file record
  const fileData = await getFileRecord(fileId);

  // Parse the content range header
  const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
  const rangeStart = Number(match[1]);
  const rangeEnd = Number(match[2]);
  const fileSize = Number(match[3]);
  const fileLocalPath = fileData.local_path;
  const fileStats = await getFileDetails(fileLocalPath);
  let currentFileSize = Number(fileStats.size);

  // Validate the content range header
  if (
    !match ||
    rangeStart >= fileSize ||
    rangeEnd > fileSize ||
    rangeStart >= rangeEnd ||
    currentFileSize !== rangeStart
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid content range header");
  }

  // Initiate a new busboy instance
  const busboy = Busboy({ headers: req.headers });

  // Define a callback function for busboy's file event
  busboy.on("file", async (fieldName, fileStream) => {
    // Create a write stream to save the file chunk
    const writeStream = fs.createWriteStream(fileLocalPath, { flags: "a" });

    // Pipe the file stream (Readable Stream) to the write stream
    fileStream.pipe(writeStream).on("error", (error) => {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error);
    });
  });

  // Define a callback function for busboy's error event
  busboy.on("error", (error) => {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error);
  });

  // Define a callback function for busboy's finish event
  busboy.on("finish", async () => {
    // Upload the file to the S3 bucket
    transferFileToS3(fileData).then((data) => {
      // Log the successful upload
      logger.warn(
        `File [${fileData.file_name}] successfully uploaded to S3 bucket \n`
      );

      // Update file status and size in the database
      fileData.status = "Completed";
      fileData.size = fileSize;
      fileData.save();

      // Delete the file from the file system
      fs.unlink(fileData.local_path, (err) => {
        if (err) {
          throw new Error(err.message);
        }
      });
    });

    return fileData;
  });

  // Pipe the request stream to busboy
  req.pipe(busboy);
};

/**
 * End of resumable upload API service functions
 **/

module.exports = {
  createDirectory,
  listFilesAndFolder,
  uploadFile,
  deleteFile,
  deleteFileAndFolder,
  getOrderFile,
  getFilesByOrderId,
  constructObjectKey,
  getPrivateFileDownloadURL,
  updateReviewStatus,
  getFileData,
  initiateUploadRequest,
  uploadFileChunk,
};
