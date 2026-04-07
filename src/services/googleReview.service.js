const https = require('https');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');

/**
 * Fetch Google reviews for a place
 * @param {Object} options - Options for fetching reviews
 * @param {string} options.placeId - Google Place ID for the business
 * @param {number} options.limit - Maximum number of reviews to return (default: 20)
 * @param {boolean} options.random - Whether to randomize the reviews (default: false)
 * @returns {Promise<Array>} - Array of reviews with name, rating, and text
 */
const getGoogleReviews = async (options = {}) => {
  try {
    const { placeId, limit = 20, random = false } = options;
    
    if (!placeId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Google Place ID is required');
    }
    
    // Google Places API endpoint for place details (includes reviews)
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'reviews',
      key: config.google.placesApiKey, // API key from config
      language: 'en' // Default to English
    });
    
    const url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
    
    // Use a promise-based approach with the built-in https module
    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            resolve(parsedData);
          } catch (error) {
            reject(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error parsing Google API response'));
          }
        });
      }).on('error', (error) => {
        reject(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error connecting to Google API', error));
      });
    });
    
    if (response.status !== 'OK') {
      throw new ApiError(
        httpStatus.BAD_REQUEST, 
        `Google API Error: ${response.status} - ${response.error_message || 'Unknown error'}`
      );
    }
    
    let reviews = [];
    
    if (response.result && response.result.reviews) {
      reviews = response.result.reviews.map(review => ({
        name: review.author_name,
        rating: review.rating,
        text: review.text,
        time: review.time, // Unix timestamp
        profilePhotoUrl: review.profile_photo_url
      }));
      
      // Sort by most recent first (default from Google)
      if (random) {
        // Randomize reviews if requested
        reviews = reviews.sort(() => 0.5 - Math.random());
      }
      
      // Limit the number of reviews
      reviews = reviews.slice(0, limit);
    }
    
    return reviews;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR, 
      'Error fetching Google reviews',
      error
    );
  }
};

module.exports = {
  getGoogleReviews
};
