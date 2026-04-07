const httpStatus = require('http-status');
const { Order, User, Rating, Review, CP } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Get client satisfaction summary statistics
 * @returns {Promise<Object>} Summary statistics
 */
const getClientSatisfactionSummary = async () => {
  try {
    // Initialize default values
    let totalOrders = 0;
    let completedOrders = 0;
    let pendingOrders = 0;
    let totalReviews = 0;
    let successRate = 0;
    let grossRating = 0;
    let ratingCount = 0;
    let totalCustomers = 0;
    let totalCPs = 0;
    
    // Get counts with error handling for each query
    try {
      totalOrders = await Order.countDocuments();
    } catch (error) {
      console.error('Error counting total orders:', error);
    }
    
    try {
      completedOrders = await Order.countDocuments({ order_status: 'completed' });
    } catch (error) {
      console.error('Error counting completed orders:', error);
    }
    
    try {
      pendingOrders = await Order.countDocuments({
        order_status: { $nin: ['completed', 'cancelled', 'in_dispute'] }
      });
    } catch (error) {
      console.error('Error counting pending orders:', error);
    }
    
    try {
      totalReviews = await Review.countDocuments();
    } catch (error) {
      console.error('Error counting total reviews:', error);
    }
    
    // Calculate success rate (completed orders / total orders)
    successRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
    
    // Calculate gross rating with error handling
    try {
      const reviewRatingAggregation = await Review.aggregate([
        {
          $match: {
            rating: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            count: { $sum: 1 }
          }
        }
      ]);
      
      grossRating = reviewRatingAggregation.length > 0 ? reviewRatingAggregation[0].averageRating : 0;
      ratingCount = reviewRatingAggregation.length > 0 ? reviewRatingAggregation[0].count : 0;
    } catch (error) {
      console.error('Error calculating gross rating:', error);
    }
    
    try {
      totalCustomers = await User.countDocuments({ role: 'user' });
    } catch (error) {
      console.error('Error counting total customers:', error);
    }
    
    try {
      totalCPs = await CP.countDocuments();
    } catch (error) {
      console.error('Error counting total CPs:', error);
    }
    
    // Format numbers to 2 decimal places where appropriate
    return {
      total_orders: totalOrders,
      completed_orders: completedOrders,
      pending_orders: pendingOrders,
      success_rate: parseFloat((successRate || 0).toFixed(2)),
      total_reviews: totalReviews,
      gross_rating: parseFloat((grossRating || 0).toFixed(2)),
      rating_count: ratingCount,
      total_customers: totalCustomers,
      total_cps: totalCPs
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching client satisfaction summary', error);
  }
};

/**
 * Get detailed review information with pagination
 * @param {Object} filter - Filter criteria
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Reviews with pagination
 */
const getDetailedReviews = async (filter, options) => {
  try {
    // Set default options if not provided
    const paginationOptions = {
      limit: 10,
      page: 1,
      ...options
    };

    // Get reviews from the Review model
    const reviews = await Review.find()
      .populate({
        path: 'client_id',
        select: 'name profile_picture email'
      })
      .populate({
        path: 'order_id',
        select: 'order_name'
      });
    
    // If no results, return empty array with pagination info
    if (!reviews || reviews.length === 0) {
      return {
        results: [],
        page: paginationOptions.page,
        limit: paginationOptions.limit,
        totalPages: 0,
        totalResults: 0
      };
    }
    
    // Calculate pagination manually
    const totalResults = reviews.length;
    const totalPages = Math.ceil(totalResults / paginationOptions.limit);
    const startIndex = (paginationOptions.page - 1) * paginationOptions.limit;
    const endIndex = Math.min(startIndex + paginationOptions.limit, totalResults);
    const paginatedReviews = reviews.slice(startIndex, endIndex);
    
    // Transform the data to match the required format
    const transformedResults = paginatedReviews.map(review => {
      // Safely access nested properties with fallbacks
      const clientId = review.client_id || {};
      const orderId = review.order_id || {};
      
      return {
        review: review.reviewText || '',
        rating: review.rating || 0,
        date: review.createdAt,
        customer: {
          id: clientId._id || '',
          name: clientId.name || 'Unknown Customer',
          profile_image: clientId.profile_picture || '',
          email: clientId.email || ''
        },
        cp: {
          id: '',
          name: 'CP Information Unavailable',
          profile_image: '',
          email: ''
        },
        order: {
          id: orderId._id || '',
          title: orderId.order_name || `Order ${orderId._id || 'Unknown'}`
        }
      };
    });
    
    return {
      results: transformedResults,
      page: parseInt(paginationOptions.page),
      limit: parseInt(paginationOptions.limit),
      totalPages: totalPages,
      totalResults: totalResults
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching detailed reviews', error);
  }
};

/**
 * Get completed orders without reviews
 * @param {Object} filter - Filter criteria
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Orders pending reviews with pagination
 */
const getPendingReviews = async (filter, options) => {
  try {
    // Set default options if not provided
    const paginationOptions = {
      limit: 10,
      page: 1,
      ...options
    };
    
    // Find all completed orders
    const completedOrders = await Order.find({ order_status: 'completed' })
      .populate({
        path: 'client_id',
        select: 'name profile_picture email'
      });
    
    if (!completedOrders || completedOrders.length === 0) {
      return {
        results: [],
        page: paginationOptions.page,
        limit: paginationOptions.limit,
        totalPages: 0,
        totalResults: 0
      };
    }
    
    // Get all review order IDs
    let reviewOrderIds = [];
    try {
      // Convert order IDs to strings for comparison
      const reviews = await Review.find({}, 'order_id');
      reviewOrderIds = reviews.map(review => review.order_id.toString());
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
    
    // Filter out orders that already have reviews
    const pendingReviewOrders = completedOrders.filter(order => {
      return !reviewOrderIds.includes(order._id.toString());
    });
    
    // Calculate pagination manually
    const totalResults = pendingReviewOrders.length;
    const totalPages = Math.ceil(totalResults / paginationOptions.limit);
    const startIndex = (paginationOptions.page - 1) * paginationOptions.limit;
    const endIndex = Math.min(startIndex + paginationOptions.limit, totalResults);
    const paginatedOrders = pendingReviewOrders.slice(startIndex, endIndex);
    
    // Transform the data to match the required format
    const transformedResults = paginatedOrders.map(order => {
      // Safely access nested properties with fallbacks
      const clientId = order.client_id || {};
      
      return {
        order: {
          id: order._id || '',
          title: order.order_name || `Order ${order._id || 'Unknown'}`,
          completed_date: order.updatedAt || new Date() // Using updatedAt as a proxy for completion date
        },
        customer: {
          id: clientId._id || '',
          name: clientId.name || 'Unknown Customer',
          profile_image: clientId.profile_picture || '',
          email: clientId.email || ''
        },
        cp: {
          id: '',
          name: 'CP Information Unavailable',
          profile_image: '',
          email: ''
        }
      };
    });
    
    return {
      results: transformedResults,
      page: parseInt(paginationOptions.page),
      limit: parseInt(paginationOptions.limit),
      totalPages: totalPages,
      totalResults: totalResults
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching pending reviews', error);
  }
};

module.exports = {
  getClientSatisfactionSummary,
  getDetailedReviews,
  getPendingReviews
};
