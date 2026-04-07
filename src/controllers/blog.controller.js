const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { blogService, gcpFileService } = require("../services");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");

/**
 * Create a new blog
 * @route POST /blogs/create
 */
const createBlog = catchAsync(async (req, res) => {
  // Validate required fields
  const { title, description, userId } = req.body;
  if (!title) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Title is required');
  }
  if (!description) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Description is required');
  }
  if (!userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User ID is required');
  }

  let featuredImageUrl = null;

  // Handle file upload if image is provided
  if (req.file) {
    try {
      const file = req.file;
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = `blogs/${userId}/${fileName}`;

      // Upload file to GCP
      const uploadResult = await gcpFileService.uploadFile(
        filePath,
        file.mimetype,
        file.size,
        userId,
        {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          type: 'blog-featured-image'
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
      featuredImageUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    } catch (error) {
      console.error('Error uploading blog image:', error);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload image');
    }
  }

  const blog = await blogService.createBlog({
    ...req.body,
    featuredImage: featuredImageUrl,
    createdBy: userId,
  });

  res.status(httpStatus.CREATED).send(blog);
});

/**
 * Get blog by ID for editing
 * @route GET /blogs/edit/:id
 */
const getBlogForEdit = catchAsync(async (req, res) => {
  // Validate ID
  const { id } = req.params;
  
  const blog = await blogService.getBlogById(id);
  
  res.send(blog);
  
});

/**
 * Update blog by ID
 * @route PUT /blogs/:id
 */
const updateBlog = catchAsync(async (req, res) => {
  // Validate ID
  const { id } = req.params;
  const { userId } = req.body;

  // Validate that at least one field to update is provided
  const updateBody = req.body;
  if (!Object.keys(updateBody).length && !req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one field must be provided for update');
  }

  let featuredImageUrl = updateBody.featuredImage;

  // Handle file upload if new image is provided
  if (req.file) {
    try {
      const file = req.file;
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = `blogs/${userId || 'unknown'}/${fileName}`;

      // Upload file to GCP
      const uploadResult = await gcpFileService.uploadFile(
        filePath,
        file.mimetype,
        file.size,
        userId,
        {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          type: 'blog-featured-image'
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
      featuredImageUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    } catch (error) {
      console.error('Error uploading blog image:', error);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload image');
    }
  }

  const updatedBlog = await blogService.updateBlogById(id, {
    ...updateBody,
    featuredImage: featuredImageUrl,
  });
  res.send(updatedBlog);
});

/**
 * Delete blog by ID
 * @route DELETE /blogs/:id
 */
const deleteBlog = catchAsync(async (req, res) => {
  // Validate ID
  const { id } = req.params;

  const blog = await blogService.getBlogById(id);

  // Check if user is authorized to delete (creator or admin)
  const isAdmin = req.user && req.user.role === 'admin';
  const isCreator = blog.createdBy.toString() === req.user.id;

  if (!isAdmin && !isCreator) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized to delete this blog');
  }

  await blogService.deleteBlogById(id);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get all blogs with pagination (admin) - Returns latest blogs first
 * @route GET /blogs/all
 */
const getAllBlogs = catchAsync(async (req, res) => {
  try {
    const filter = pick(req.query, ['title', 'createdBy']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Set default pagination if not provided
    if (!options.limit) options.limit = 10;
    if (!options.page) options.page = 1;

    // Set default sort to latest blogs first (newest to oldest)
    if (!options.sortBy) options.sortBy = 'createdAt:desc';

    const result = await blogService.queryBlogs(filter, options);
    res.send(result);
  } catch (error) {
    console.error('Error in getAllBlogs controller:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Error retrieving blogs'
    );
  }
});

/**
 * Get public blogs with pagination - Returns latest blogs first
 * @route GET /api/blogs
 */
const getPublicBlogs = catchAsync(async (req, res) => {
  try {
    const filter = pick(req.query, ['title']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Set default pagination if not provided
    if (!options.limit) options.limit = 10;
    if (!options.page) options.page = 1;

    // Set default sort to latest blogs first (newest to oldest)
    if (!options.sortBy) options.sortBy = 'createdAt:desc';

    const result = await blogService.getPublicBlogs(filter, options);
    res.send(result);
  } catch (error) {
    console.error('Error in getPublicBlogs controller:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Error retrieving blogs'
    );
  }
});

/**
 * Get blog by slug (public)
 * @route GET /api/blogs/:slug
 */
const getBlogBySlug = catchAsync(async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Slug is required');
    }
    
    const blog = await blogService.getBlogBySlug(slug);
    res.send(blog);
  } catch (error) {
    console.error('Error in getBlogBySlug controller:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Error retrieving blog'
    );
  }
});

module.exports = {
  createBlog,
  getBlogForEdit,
  updateBlog,
  deleteBlog,
  getAllBlogs,
  getPublicBlogs,
  getBlogBySlug,
};
