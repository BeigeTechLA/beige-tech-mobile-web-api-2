const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { orderService, paymentService, gcpFileService } = require("../services");
const emailEnhancedService = require("../services/email.enhanced.service");
const getLastFiveChars = require("../utils/getLastFiveCharc");

const createOrder = catchAsync(async (req, res) => {
  //Get order data
  const orderData = req.body;

  //Generate Order Payment Values
  const orderAmount = 1200;
  //Add budget_max value to order data
  orderData.budget_max = orderAmount;

  //Create order record
  const order = await orderService.createOrder(orderData);
  res.status(httpStatus.CREATED).json(order);
});
// New
const getOrders = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const filter = pick(requestQuery, ["client_id", "order_status", "category", "service_type"]);

  // Check for "cp_id" and "decision" in the query parameters
  if (requestQuery.cp_id && requestQuery.decision === "pending") {
    filter.cp_ids = {
      $elemMatch: { id: requestQuery.cp_id, decision: "pending" },
    };
  } else if (requestQuery.cp_id) {
    // Exclude cancelled decisions - CP shouldn't see orders they cancelled
    filter.cp_ids = { $elemMatch: { id: requestQuery.cp_id, decision: { $ne: "cancelled" } } };
  }

  // Check for "cp_ids" in the query parameters
  if (requestQuery.cp_ids) {
    const cpIdFilter = requestQuery.cp_ids.map((cpId) => ({
      "cp_ids.id": cpId,
    }));
    if (!filter.cp_ids) {
      filter.$or = cpIdFilter;
    } else {
      filter.$or = [...cpIdFilter, { "cp_ids.id": requestQuery.cp_id }];
    }
  }

  if (requestQuery.search) {
    filter.order_name = { $regex: requestQuery.search, $options: "i" };
  }

  const options = pick(requestQuery, ["sortBy", "limit", "page", "populate"]);
  const result = await orderService.queryOrders(filter, options);
  res.send(result);
});

const getOrder = catchAsync(async (req, res) => {
  const cid = req.query.populate;
  let order;
  if (cid === "cp_ids") {
    order = await orderService.getOrderById(req.params.orderId, cid);
  } else {
    order = await orderService.getOrderById(req.params.orderId);
  }
  // const order = await orderService.getOrderById(req.params.orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }
  res.send(order);
});

const getOrderByUserId = catchAsync(async (req, res) => {
  const order = await orderService.getOrderByUserId(req.params.userId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }
  res.send(order);
});

const updateOrder = catchAsync(async (req, res) => {
  // Pass the user who is making the update to exclude them from notifications
  const updatedBy = req.user ? {
    userId: req.user._id || req.user.id,
    role: req.user.role
  } : null;

  const order = await orderService.updateOrderById(
    req.params.orderId,
    req.body,
    updatedBy
  );
  res.send(order);
});

const deleteOrder = catchAsync(async (req, res) => {
  await orderService.deleteOrderById(req.params.orderId);
  res.status(httpStatus.NO_CONTENT).send();
});

// Get busy area and polygons
const getBusyArea = catchAsync(async (req, res) => {
  const myLocation = req.query.myLocation;
  const busyArea = await orderService.getBusyArea(myLocation);
  res.send(busyArea);
});

/**
 * Get files for a specific order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOrderFiles = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  
  // Get files for the order
  const result = await gcpFileService.getFilesByOrderId(orderId);
  
  if (!result.success) {
    throw new ApiError(httpStatus.NOT_FOUND, result.error || 'Failed to fetch files for order');
  }
  
  res.status(httpStatus.OK).send(result);
});

/**
 * Upload media files and platform links to an order
 * @route POST /orders/:orderId/media
 */
const uploadOrderMedia = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  let { platformLinks, folderType } = req.body;
  const files = req.files;

  // Parse platformLinks if it's a string (happens with multipart/form-data)
  if (platformLinks && typeof platformLinks === 'string') {
    try {
      platformLinks = JSON.parse(platformLinks);
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid platformLinks format. Must be a valid JSON array.');
    }
  }

  // Parse folderType if it's a string (happens with multipart/form-data)
  if (folderType && typeof folderType === 'string') {
    folderType = folderType.trim();
  }

  // Default to 'pre' if not specified
  const uploadFolderType = folderType === 'post' ? 'post_production' : 'pre_production';

  // Validate input
  if ((!files || files.length === 0) && (!platformLinks || platformLinks.length === 0)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one file or platform link is required');
  }

  // Validate maximum number of files
  if (files && files.length > 5) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Maximum 5 files allowed');
  }

  // Validate file types
  if (files && files.length > 0) {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'
    ];

    const invalidFiles = files.filter(file => !allowedTypes.includes(file.mimetype));
    if (invalidFiles.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid file type(s): ${invalidFiles.map(f => f.originalname).join(', ')}. Only images and videos are allowed.`
      );
    }
  }

  // Validate platform links
  if (platformLinks && platformLinks.length > 0) {
    const allowedPlatforms = ['YouTube', 'Vimeo', 'Instagram', 'Google Drive', 'Pinterest', 'Other'];

    const invalidPlatforms = platformLinks.filter(link => !allowedPlatforms.includes(link.platform));
    if (invalidPlatforms.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid platform(s): ${invalidPlatforms.map(p => p.platform).join(', ')}. Allowed platforms: ${allowedPlatforms.join(', ')}`
      );
    }

    // Validate URLs
    const invalidUrls = platformLinks.filter(link => !link.url || !link.url.trim());
    if (invalidUrls.length > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'All platform links must have a valid URL');
    }
  }

  // Get the order to generate folder name
  const order = await orderService.getOrderById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }

  // Use the stored folder path from order.file_path.dir_name (set during order creation)
  let folderName = order.file_path?.dir_name || order.order_name;
  // Strip Website_Shoots_Flow/ prefix if present (handles legacy corrupted dir_name values)
  if (folderName.startsWith('Website_Shoots_Flow/')) {
    folderName = folderName.substring('Website_Shoots_Flow/'.length);
  }
  const folderPath = `${uploadFolderType}/${folderName}/`;

  console.log(`📤 Uploading files to ${folderPath} (folderType: ${folderType || 'pre (default)'})`);

  
  // Upload files to GCP
  const fileUrls = [];
  const uploadedFileNames = new Set(); // to track duplicates
  
  if (files && files.length > 0) {
    try {
      const { Storage } = require('@google-cloud/storage');
      const config = require('../config/config');
      const storage = new Storage({ keyFilename: config.GCP.keyFilename });
      const bucket = storage.bucket(config.GCP.bucketName);
      
      // Process each file
      for (const file of files) {
        const timestamp = Date.now();
        const originalName = file.originalname;
        
        // Prevent uploading the same file twice
        const uniqueKey = `${originalName}-${file.size}`;
        if (uploadedFileNames.has(uniqueKey)) continue;
        uploadedFileNames.add(uniqueKey);
        
        const fileName = `${timestamp}-${originalName.replace(/\s+/g, '-')}`;
        const filePath = `${folderPath}${fileName}`;
        const gcpFile = bucket.file(filePath);
        
        const stream = gcpFile.createWriteStream({
          metadata: { 
            contentType: file.mimetype,
            metadata: { orderId: orderId } // Add order ID to metadata
          },
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

        // Save file metadata to database for file manager access
        try {
          const { FileMeta } = require('../models');

          // Use filePath as-is (already in correct format: post_production/FolderName/file.jpg)
          const cleanPath = filePath;

          // Get CP IDs from order
          const cpIds = order.cp_ids?.map(cp => {
            const cpId = cp.id?._id || cp.id?.id || cp.id || cp;
            return cpId;
          }).filter(Boolean) || [];

          // Get client ID
          const clientId = order.client_id?.id || order.client_id?._id || order.client_id;

          console.log(`💾 Saving file to database:`, {
            path: cleanPath,
            userId: clientId,
            cpIds: cpIds,
            orderId: order.id || order._id
          });

          // Create file metadata
          await FileMeta.create({
            name: file.originalname,
            path: cleanPath,
            isFolder: false,
            userId: clientId,
            size: file.size,
            contentType: file.mimetype,
            metadata: {
              cpIds: cpIds,
              orderId: order.id || order._id,
            }
          });

          console.log(`✅ Saved file metadata to database: ${cleanPath}`);
        } catch (dbError) {
          console.error('❌ Error saving file metadata to database:', dbError);
          console.error('❌ Database error details:', dbError.message);
          // Continue even if database save fails
        }
      }
    } catch (error) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error uploading files: ${error.message}`);
    }
  }

  // Update order with file URLs and platform links
  const updatedOrder = await orderService.updateOrderMediaLinks(orderId, fileUrls, platformLinks);
  
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Media uploaded successfully',
    order: {
      id: updatedOrder.id,
      fileUrls: updatedOrder.fileUrls,
      platformLinks: updatedOrder.platformLinks,
      totalFiles: updatedOrder.fileUrls.length,
      totalPlatformLinks: updatedOrder.platformLinks.length
    }
  });
});

/**
 * Get media links (fileUrls and platformLinks) for a specific order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOrderMediaLinks = catchAsync(async (req, res) => {
  const orderId = req.params.orderId || req.query.orderId;
  
  if (!orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
  }
  
  // Get the order from the database
  const order = await orderService.getOrderById(orderId);
  
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }
  
  // Return only the fileUrls and platformLinks
  res.status(httpStatus.OK).json({
    fileUrls: order.fileUrls || [],
    platformLinks: order.platformLinks || []
  });
});

/**
 * Download invoice for an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const downloadInvoice = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  
  // Get the order from the database
  const order = await orderService.getOrderById(orderId);
  
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }
  
  // Check if the user has access to this order
  // const userId = req.user.id;
  // const isAdmin = req.user.role === 'admin';
  // const isClient = order.client_id.toString() === userId;
  // const isServiceProvider = order.cp_ids.some(cp => cp.id.toString() === userId);

  // if (!isAdmin && !isClient && !isServiceProvider) {
  //   throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access this invoice');
  // }
  
  // Generate the invoice HTML
  const invoiceHtml = await orderService.generateInvoiceHtml(order);
  
  // Set response headers
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderId.slice(-5)}.html"`);
  
  // Send the invoice HTML
  res.send(invoiceHtml);
});

/**
 * Download professional PDF invoice for an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const downloadProfessionalInvoice = catchAsync(async (req, res) => {
  const { orderId } = req.params;

  // Get the order from the database
  const order = await orderService.getOrderById(orderId);

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }

  // Check if the user has access to this order
  // const userId = req.user.id;
  // const isAdmin = req.user.role === 'admin';
  // const isClient = order.client_id.toString() === userId;
  // const isServiceProvider = order.cp_ids.some(cp => cp.id.toString() === userId);

  // if (!isAdmin && !isClient && !isServiceProvider) {
  //   throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access this invoice');
  // }

  // Generate the PDF invoice
  const pdfBuffer = await orderService.generateProfessionalInvoicePDF(order);

  // Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderId.slice(-5)}.pdf"`);

  // Send the PDF buffer
  res.send(pdfBuffer);
});

/**
 * Assign creative to an order and send notification email
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const assignCreative = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const { name, phone, email, socialHandles } = req.body;

  // Validate required fields
  if (!name || !phone) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Creative name and phone are required');
  }

  // Get the order from the database
  const order = await orderService.getOrderById(orderId);

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }

  // Update order with assigned creative info
  const assignedCreative = {
    name,
    phone,
    email: email || undefined,
    socialHandles: socialHandles || undefined,
    assignedAt: new Date(),
  };

  const updatedOrder = await orderService.updateOrderById(orderId, {
    assignedCreative
  });

  // Determine client email and name
  const clientEmail = order.guest_info?.email || order.client_id?.email;
  const clientName = order.guest_info?.name || order.client_id?.name || 'Client';

  if (!clientEmail) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Client email not found for this order');
  }

  // Prepare template data for the creative assignment email
  const templateData = {
    clientName,
    creativeName: name,
    creativePhone: phone,
    creativeEmail: email || '',
    creativeSocial: socialHandles || ''
  };

  // Load template and send email using enhanced email service (SendGrid)
  const htmlContent = await emailEnhancedService.loadTemplate('creative-assignment', templateData);
  const emailResult = await emailEnhancedService.sendEmail({
    to: clientEmail,
    subject: 'Your Creative Has Been Assigned!',
    html: htmlContent
  });

  if (emailResult.success) {
    // Update emailSentAt timestamp
    await orderService.updateOrderById(orderId, {
      'assignedCreative.emailSentAt': new Date()
    });
  }

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Creative assigned and email sent successfully',
    order: updatedOrder,
    emailSent: emailResult.success
  });
});

/**
 * Assign creative partner to order by email (adds to cp_ids array)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const assignCreativeByEmail = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const { creativeEmail } = req.body;
  const User = require("../models/user.model");

  // Validate required fields
  if (!creativeEmail) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Creative partner email is required');
  }

  // Find creative partner by email
  const creative = await User.findOne({ email: creativeEmail, role: 'cp' });

  if (!creative) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No creative partner found with this email address');
  }

  // Get the order from the database
  const order = await orderService.getOrderById(orderId);

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }

  // Check if creative is already assigned
  const isAlreadyAssigned = order.cp_ids.some(
    (cp) => cp.id.toString() === creative._id.toString()
  );

  if (isAlreadyAssigned) {
    return res.status(httpStatus.OK).send({
      success: true,
      message: `${creative.name} is already assigned to this order`,
      order,
    });
  }

  // Add creative to cp_ids array
  order.cp_ids.push({
    id: creative._id,
    decision: 'pending',
  });

  await order.save();

  // Populate the cp_ids to get creative details for response
  await order.populate('cp_ids.id', 'name email contact_number');

  res.status(httpStatus.OK).send({
    success: true,
    message: `${creative.name} assigned to order successfully`,
    order: {
      id: order._id,
      order_name: order.order_name,
      assignedCreatives: order.cp_ids,
    },
  });
});

module.exports = {
  createOrder,
  getOrders,
  getOrder,
  getOrderByUserId,
  updateOrder,
  deleteOrder,
  getBusyArea,
  getOrderFiles,
  uploadOrderMedia,
  getOrderMediaLinks,
  downloadInvoice,
  downloadProfessionalInvoice,
  assignCreative,
  assignCreativeByEmail,
};
