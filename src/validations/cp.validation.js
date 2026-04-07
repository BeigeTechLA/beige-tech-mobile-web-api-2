const Joi = require('joi');

const filterRankedCPs = {
  query: Joi.object().keys({
    // Geolocation parameters
    latitude: Joi.number().min(-90).max(90).optional().messages({
      'number.min': 'Latitude must be between -90 and 90',
      'number.max': 'Latitude must be between -90 and 90',
    }),
    longitude: Joi.number().min(-180).max(180).optional().messages({
      'number.min': 'Longitude must be between -180 and 180',
      'number.max': 'Longitude must be between -180 and 180',
    }),
    radius: Joi.number().min(0).max(500).default(50).optional().messages({
      'number.min': 'Radius must be greater than 0',
      'number.max': 'Radius cannot exceed 500 km',
    }),
    radiusUnit: Joi.string().valid('km', 'miles').default('km').optional(),

    // Filter criteria
    tier: Joi.string().valid('bronze', 'silver', 'gold', 'platinum').optional(),
    minRating: Joi.number().min(0).max(5).optional(),
    minAcceptanceRate: Joi.number().min(0).max(100).optional(),
    minTrustScore: Joi.number().min(0).max(100).optional(),
    minSuccessfulShoots: Joi.number().min(0).optional(),
    
    // Content type filters
    content_type: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),
    content_verticals: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),

    // Recent activity (in days)
    maxDaysSinceActive: Joi.number().min(0).max(365).default(30).optional(),

    // Sorting and pagination
    sortBy: Joi.string().valid('rankingScore', 'distance', 'rating', 'tier', 'trustScore').default('rankingScore').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
    limit: Joi.number().integer().min(1).max(100).default(10).optional(),
    page: Joi.number().integer().min(1).default(1).optional(),

    // Equipment filter
    equipment: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),

    // Other filters
    review_status: Joi.string().valid('pending', 'accepted', 'rejected').default('accepted').optional(),
    rateFlexibility: Joi.boolean().optional(),
    travel_to_distant_shoots: Joi.boolean().optional(),
    city: Joi.string().optional(),
    zip_code: Joi.string().optional(),
  }),
};

module.exports = {
  filterRankedCPs,
};
