const { Order, Review, User, CP } = require("../models");
const cpService = require("./cp.service");
const Rating = require("../models/rating.model");
const mongoose = require("mongoose");

const createReview = async (data) => {
  try {
    // Check if order exists
    const order = await Order.findById(data.order_id);
    if (!order) {
      throw new Error("Order not found");
    }
    
    // Check if order is completed
    if (order.order_status !== 'completed') {
      throw new Error("Cannot review an order that is not completed");
    }
    
    // Check if a review already exists for this order
    const existingReview = await Review.findOne({ order_id: data.order_id });
    if (existingReview) {
      throw new Error("A review already exists for this order");
    }
    
    const cp_ids = order.cp_ids; // Assuming cp_ids is the field in the order document
    const review = new Review({
      ...data,
      cp_ids: cp_ids,
    });
    
    // Update CP ratings if there are any CPs
    if (cp_ids && cp_ids.length > 0) {
      cp_ids.forEach(async (cp_id) => {
        if (cp_id && cp_id.id) {
          updateCpsAverageRating(cp_id.id);
        }
      });
    }
    
    await review.save();
    await Order.findByIdAndUpdate(data.order_id, { review_status: true });
    return review;
  } catch (error) {
    throw error;
  }
};

const getAllReviews = async (filter, options) => {
  const reviews = await Review.paginate(filter, options);
  return reviews;
};

const deleteReview = async (reviewId, userId) => {
  const user = await User.findById(userId);
  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized: Only managers can delete reviews");
  }
  const review = await Review.findByIdAndDelete(reviewId);
  return review;
};

// Avarage rating calculation
const updateCpsAverageRating = async (userId) => {
  try {
    // Fetch the reviews for the user's
    const reviews = await Review.find({ "cp_ids.id": userId }).exec();

    // If there are no reviews, set average_rating to a default value or leave it unset
    if (reviews.length === 0) {
      return null;
    }

    // Initialize counters for each star rating
    const starCounts = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };

    // Count the number of reviews for each star rating
    reviews.forEach((review) => {
      const rating = review.rating;
      if (rating >= 1 && rating <= 5) {
        starCounts[rating]++;
      }
    });

    // Calculate total reviews score and total number of reviews
    let totalReviews = 0;
    let totalUserReview = 0;

    for (let rating = 1; rating <= 5; rating++) {
      totalReviews += rating * starCounts[rating];
      totalUserReview += starCounts[rating];
    }

    // Calculate the average rating
    const averageRating =
      totalUserReview > 0 ? totalReviews / totalUserReview : 0;
    const average_rating = Math.round(averageRating * 100) / 100;

    // Update the CP with the average rating
    const updatedCp = await cpService.updateCpByUserId(userId, {
      average_rating,
    });

    return average_rating;
  } catch (error) {
    console.error("Error calculating average rating:", error);
    throw error;
  }
};

/**
 * Get featured reviews for frontend display (limited to 12)
 * @returns {Promise<Object[]>} Array of featured reviews
 */
const getFeaturedReviews = async () => {
  // Get 12 most recent reviews with high ratings (4-5 stars)
  const reviews = await Review.find({ rating: { $gte: 4 } })
    .sort({ createdAt: -1 })
    .limit(12)
    .populate({
      path: 'client_id',
      select: 'name profile_picture'
    })
    .populate({
      path: 'cp_ids.id',
      select: 'name profile_picture'
    })
    .populate({
      path: 'order_id',
      select: 'order_name content_vertical'
    })
    .lean();

  // Format the response
  return reviews.map(review => {
    // Get the first CP from the cp_ids array (or null if empty)
    const cp = review.cp_ids && review.cp_ids.length > 0 ? review.cp_ids[0].id : null;
    
    return {
      id: review._id,
      rating: review.rating,
      review: review.reviewText,
      client: {
        id: review.client_id._id,
        name: review.client_id.name,
        profileImage: review.client_id.profile_picture
      },
      contentProvider: cp ? {
        id: cp._id,
        name: cp.name,
        profileImage: cp.profile_picture
      } : null,
      order: review.order_id ? {
        id: review.order_id._id,
        name: review.order_id.order_name,
        category: review.order_id.content_vertical
      } : null,
      date: review.createdAt
    };
  });
};

/**
 * Get top 7 content providers with highest trust score
 * @returns {Promise<Object[]>} Array of top trusted CPs
 */
const getTopTrustedCPs = async () => {
  const topCPs = await CP.find({
    trust_score: { $gt: 0 }
  })
    .sort({ trust_score: -1 })
    .limit(7)
    .populate({
      path: 'userId',
      select: 'name profile_picture'
    })
    .lean();

  // Format the response
  return topCPs.map(cp => ({
    id: cp.userId._id,
    name: cp.userId.name,
    profileImage: cp.userId.profile_picture,
    trustScore: cp.trust_score,
    cpId: cp._id
  }));
};

module.exports = {
  createReview,
  getAllReviews,
  deleteReview,
  updateCpsAverageRating,
  getFeaturedReviews,
  getTopTrustedCPs,
};
