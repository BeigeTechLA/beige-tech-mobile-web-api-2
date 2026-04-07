const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { portfolioService, gcpFileService } = require("../services");
const { CP } = require("../models");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");

/**
 * Create a new portfolio
 * @route POST /portfolios/create
 */
const createPortfolio = catchAsync(async (req, res) => {
  // Validate required fields
  const { portfolioName, cpId, userId } = req.body;

  if (!portfolioName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Portfolio name is required');
  }
  if (!cpId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'CP ID is required');
  }
  if (!userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User ID is required');
  }

  // Validate cpId format
  if (!mongoose.Types.ObjectId.isValid(cpId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid CP ID format');
  }

  // Verify CP exists
  const cpExists = await CP.findById(cpId);
  if (!cpExists) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Care Provider not found');
  }

  let mediaFiles = [];

  // Handle multiple file uploads if provided
  if (req.files && req.files.length > 0) {
    try {
      for (const file of req.files) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const filePath = `portfolios/${cpId}/${fileName}`;

        // Upload file to GCP
        await gcpFileService.uploadFile(
          filePath,
          file.mimetype,
          file.size,
          userId,
          {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
            type: 'portfolio-media',
            cpId: cpId
          }
        );

        // Upload the actual file content
        const bucket = gcpFileService.bucket;
        const gcpFile = bucket.file(filePath);

        await gcpFile.save(file.buffer, {
          metadata: {
            contentType: file.mimetype,
          },
        });

        // Make file public and get URL
        await gcpFile.makePublic();
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        mediaFiles.push(fileUrl);
      }
    } catch (error) {
      console.error('Error uploading portfolio media:', error);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload media files');
    }
  }

  // Parse specialities if sent as string
  let specialities = req.body.specialities;
  if (typeof specialities === 'string') {
    try {
      specialities = JSON.parse(specialities);
    } catch (error) {
      specialities = [specialities];
    }
  }

  const portfolio = await portfolioService.createPortfolio({
    ...req.body,
    specialities,
    mediaFiles,
    createdBy: userId,
    cpId,
  });

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Portfolio created successfully',
    data: portfolio,
  });
});

/**
 * Get portfolio by ID
 * @route GET /portfolios/:id
 */
const getPortfolioById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const portfolio = await portfolioService.getPortfolioById(id);

  res.send({
    success: true,
    data: portfolio,
  });
});

/**
 * Get all portfolios for a specific CP
 * @route GET /portfolios/cp/:cpId
 */
const getPortfoliosByCpId = catchAsync(async (req, res) => {
  const { cpId } = req.params;
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  // Set default pagination if not provided
  if (!options.limit) options.limit = 10;
  if (!options.page) options.page = 1;

  const result = await portfolioService.getPortfoliosByCpId(cpId, options);

  res.send({
    success: true,
    data: result,
  });
});

/**
 * Update portfolio by ID
 * @route PUT /portfolios/:id
 */
const updatePortfolio = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  // Validate that at least one field to update is provided
  const updateBody = { ...req.body };
  if (!Object.keys(updateBody).length && (!req.files || req.files.length === 0)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one field must be provided for update');
  }

  // Get existing portfolio to get cpId for file upload path
  const existingPortfolio = await portfolioService.getPortfolioById(id);
  const cpId = existingPortfolio.cpId._id || existingPortfolio.cpId;

  let newMediaFiles = [...(existingPortfolio.mediaFiles || [])];

  // Handle new file uploads if provided
  if (req.files && req.files.length > 0) {
    try {
      for (const file of req.files) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const filePath = `portfolios/${cpId}/${fileName}`;

        // Upload file to GCP
        await gcpFileService.uploadFile(
          filePath,
          file.mimetype,
          file.size,
          userId || existingPortfolio.createdBy,
          {
            originalName: file.originalname,
            uploadedAt: new Date().toISOString(),
            type: 'portfolio-media',
            cpId: cpId
          }
        );

        // Upload the actual file content
        const bucket = gcpFileService.bucket;
        const gcpFile = bucket.file(filePath);

        await gcpFile.save(file.buffer, {
          metadata: {
            contentType: file.mimetype,
          },
        });

        // Make file public and get URL
        await gcpFile.makePublic();
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        newMediaFiles.push(fileUrl);
      }
    } catch (error) {
      console.error('Error uploading portfolio media:', error);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload media files');
    }
  }

  // Parse specialities if sent as string
  if (updateBody.specialities && typeof updateBody.specialities === 'string') {
    try {
      updateBody.specialities = JSON.parse(updateBody.specialities);
    } catch (error) {
      updateBody.specialities = [updateBody.specialities];
    }
  }

  const updatedPortfolio = await portfolioService.updatePortfolioById(id, {
    ...updateBody,
    mediaFiles: newMediaFiles,
  });

  res.send({
    success: true,
    message: 'Portfolio updated successfully',
    data: updatedPortfolio,
  });
});

/**
 * Delete portfolio by ID (soft delete)
 * @route DELETE /portfolios/:id
 */
const deletePortfolio = catchAsync(async (req, res) => {
  const { id } = req.params;

  const portfolio = await portfolioService.deletePortfolioById(id);

  res.send({
    success: true,
    message: 'Portfolio deleted successfully',
    data: portfolio,
  });
});

/**
 * Permanently delete portfolio by ID
 * @route DELETE /portfolios/:id/permanent
 */
const permanentlyDeletePortfolio = catchAsync(async (req, res) => {
  const { id } = req.params;

  await portfolioService.permanentlyDeletePortfolioById(id);

  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get all portfolios with pagination
 * @route GET /portfolios/all
 */
const getAllPortfolios = catchAsync(async (req, res) => {
  try {
    const filter = pick(req.query, ['portfolioName', 'cpId', 'specialities']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Set default pagination if not provided
    if (!options.limit) options.limit = 10;
    if (!options.page) options.page = 1;

    // Set default sort to latest portfolios first (newest to oldest)
    if (!options.sortBy) options.sortBy = 'createdAt:desc';

    const result = await portfolioService.queryPortfolios(filter, options);

    res.send({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error in getAllPortfolios controller:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Error retrieving portfolios'
    );
  }
});

/**
 * Increment portfolio view count
 * @route POST /portfolios/:id/view
 */
const incrementPortfolioViews = catchAsync(async (req, res) => {
  const { id } = req.params;

  const portfolio = await portfolioService.incrementViews(id);

  res.send({
    success: true,
    message: 'View count incremented',
    data: portfolio,
  });
});

/**
 * Get portfolio by ID for public viewing (increments view count)
 * @route GET /portfolios/:id/view
 */
const viewPortfolio = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Get portfolio and increment view count
  const portfolio = await portfolioService.getPortfolioById(id);
  await portfolioService.incrementViews(id);

  res.send({
    success: true,
    data: portfolio,
  });
});

module.exports = {
  createPortfolio,
  getPortfolioById,
  getPortfoliosByCpId,
  updatePortfolio,
  deletePortfolio,
  permanentlyDeletePortfolio,
  getAllPortfolios,
  incrementPortfolioViews,
  viewPortfolio,
};

