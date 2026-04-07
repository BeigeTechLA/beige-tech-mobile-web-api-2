const httpStatus = require("http-status");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const { Blog } = require("../models");

/**
 * Create a new blog
 * @param {Object} blogBody - Blog data
 * @returns {Promise<Blog>}
 */
const createBlog = async (blogBody) => {
  try {
    console.log('Creating blog with data:', blogBody);
    const blog = await Blog.create(blogBody);
    return blog;
  } catch (error) {
    console.error('Error in createBlog service:', error);

    // Handle duplicate key error (slug or title)
    if ((error.name === 'MongoError' || error.name === 'MongoServerError') && error.code === 11000) {
      if (error.keyValue && error.keyValue.slug) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A blog with a similar title already exists. Please use a different title.');
      }
      throw new ApiError(httpStatus.BAD_REQUEST, 'Blog with that title already exists');
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      throw new ApiError(httpStatus.BAD_REQUEST, `Validation error: ${validationErrors.join(', ')}`);
    }

    // Handle other specific errors
    if (error instanceof ApiError) {
      throw error;
    }

    // Generic error with more details
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Error creating blog: ${error.message}`);
  }
};

/**
 * Get blog by id
 * @param {ObjectId} id - Blog id
 * @returns {Promise<Blog>}
 */
const getBlogById = async (id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid blog ID');
    }
    
    const blog = await Blog.findById(id).populate('createdBy', 'name email profile');
    
    if (!blog) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
    }
    
    return blog;
  } catch (error) {
    console.error('Error in getBlogById:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving blog');
  }
};

/**
 * Get blog by slug
 * @param {string} slug - Blog slug
 * @returns {Promise<Blog>}
 */
const getBlogBySlug = async (slug) => {
  try {
    if (!slug) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Slug is required');
    }
    
    const blog = await Blog.findOne({ slug }).populate('createdBy', 'name email profile');
    
    if (!blog) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Blog not found');
    }
    
    // Increment view count
    blog.viewsCount += 1;
    await blog.save();
    
    return blog;
  } catch (error) {
    console.error('Error in getBlogBySlug:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving blog');
  }
};

/**
 * Update blog by id
 * @param {ObjectId} blogId - Blog id
 * @param {Object} updateBody - Blog update data
 * @returns {Promise<Blog>}
 */
const updateBlogById = async (blogId, updateBody) => {
  try {
    const blog = await getBlogById(blogId);
    
    Object.assign(blog, updateBody);
    await blog.save();
    return blog;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error updating blog');
  }
};

/**
 * Delete blog by id
 * @param {ObjectId} blogId - Blog id
 * @returns {Promise<Blog>}
 */
const deleteBlogById = async (blogId) => {
  try {
    const blog = await getBlogById(blogId);
    await Blog.deleteOne({ _id: blogId });
    return blog;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error deleting blog');
  }
};

/**
 * Get all blogs with pagination (admin)
 * @param {Object} filter - Filter options
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryBlogs = async (filter, options) => {
  try {
    // Convert populate object to string format expected by the paginate plugin
    const paginateOptions = {
      ...options,
      populate: 'createdBy'
    };
    
    const blogs = await Blog.paginate(filter, paginateOptions);
    return blogs;
  } catch (error) {
    console.error('Error in queryBlogs:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving blogs');
  }
};

/**
 * Get public blogs with pagination
 * @param {Object} filter - Filter options
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getPublicBlogs = async (filter, options) => {
  try {
    // Convert populate object to string format expected by the paginate plugin
    const paginateOptions = {
      ...options,
      select: 'title slug shortDescription viewsCount createdAt',
      populate: 'createdBy',
      sortBy: 'createdAt:desc'
    };
    
    const blogs = await Blog.paginate(filter, paginateOptions);
    return blogs;
  } catch (error) {
    console.error('Error in getPublicBlogs:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving blogs');
  }
};

module.exports = {
  createBlog,
  getBlogById,
  getBlogBySlug,
  updateBlogById,
  deleteBlogById,
  queryBlogs,
  getPublicBlogs,
};
