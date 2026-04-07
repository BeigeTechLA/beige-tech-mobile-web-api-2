const httpStatus = require("http-status");
const { CP, Order } = require("../models");
const ApiError = require("../utils/ApiError");
const { userService } = require("../services");

const createCP = async (cpBody) => {
  const user = await userService.getUserById(cpBody.userId);
  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "User not found, please create a user first"
    );
  }
  const cp = await CP.findOne({ userId: cpBody.userId });
  if (cp) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "CP already exists, please update the existing CP"
    );
  }
  await userService.updateUserById(cpBody.userId, { role: "cp" });
  return CP.create(cpBody);
};

const queryCPs1 = async (filter, options) => {
  options.populate = "userId"; // Add populate criteria
  if (filter.search !== "") {
    if (filter.search) {
      filter["userId.name"] = { $regex: filter.search, $options: "i" };
      delete filter.search;
    }
    const cps = await CP.paginateCp(filter, options);
    return cps;
  }
};

const queryCPs = async (filter, options) => {
  options.populate = "userId";

  if (filter.search !== "") {
    if (filter.search) {
      filter["userId.name"] = { $regex: filter.search, $options: "i" };
      delete filter.search;
    }
    const cps = await CP.paginateCp(filter, options);
    return cps;
  }
};

const getCpById = async (id) => {
  // return CP.findById(id).populate("userId");
  return CP.findOne({ userId: id }).populate("userId");
};

const getCpByUserId = async (userId) => {
  return CP.findOne({ userId: userId });
};

const updateCpByUserId = async (userId, updateBody) => {
  const cp = await CP.findOne({ userId });
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }
  cp.set(updateBody);
  await cp.save();
  return cp;
};

// Function to calculate acceptance and cancellation rates
const calculateCpRates = async (cpId) => {
  // Total completed orders involving the specific CP
  const totalCompletedOrders = await Order.countDocuments({
    cp_ids: { $elemMatch: { id: cpId } },
    order_status: "completed",
  });

  // Completed orders where the specific CP accepted
  const acceptedCompletedOrders = await Order.countDocuments({
    cp_ids: { $elemMatch: { id: cpId, decision: "accepted" } },
    order_status: "completed",
  });

  // Completed orders where the specific CP cancelled
  const cancelledCompletedOrders = await Order.countDocuments({
    cp_ids: { $elemMatch: { id: cpId, decision: "cancelled" } },
    order_status: "completed",
  });

  const acceptanceRate = totalCompletedOrders
    ? (acceptedCompletedOrders / totalCompletedOrders) * 100
    : 0;
  const cancellationRate = totalCompletedOrders
    ? (cancelledCompletedOrders / totalCompletedOrders) * 100
    : 0;

  return {
    acceptanceRate: Math.floor(acceptanceRate),
    cancellationRate: Math.floor(cancellationRate),
  };
};

const deleteCpByUserId = async (userId) => {
  const cp = await CP.findOne({ userId });
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }
  await cp.deleteOne();
  return cp;
};

const updateCpById = async (cpId, updateBody) => {
  const cp = await getCpById(cpId);
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }
  Object.assign(cp, updateBody);
  await cp.save();
  return cp;
};

const deleteCpById = async (cpId) => {
  const cp = await getCpById(cpId);
  if (!cp) {
    throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
  }
  await cp.deleteOne();
  return cp;
};
/**
 * Get CP with detailed user data by ID
 * @param {String} cpId - CP ID to retrieve
 * @returns {Promise<Object>} - CP document with populated user data
 */
const getCpWithUserData = async (cpId) => {
  try {
    if (!cpId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "CP ID is required");
    }

    // Find the CP by ID and populate the user data
    const cp = await CP.findOne({ userId: cpId }).populate({
      path: "userId",
      select: "name email phone_number location profile_picture role", // Select the user fields you want to include
    });

    if (!cp) {
      throw new ApiError(httpStatus.NOT_FOUND, "CP not found");
    }

    return cp;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Error retrieving CP");
  }
};

/**
 * Find CPs by content type and budget
 * @param {String} contentType - Content type: 'photo', 'video', or 'both'
 * @param {String|Array} budget - Budget as string '10-50' or array [10, 50]
 * @returns {Promise<Array>} - Array of matching CPs with user data
 *
 * Example:
 * - contentType: 'photo', budget: '10-30' → matches CPs where photographyRate is between 10-30
 * - contentType: 'video', budget: '20-50' → matches CPs where videographyRate is between 20-50
 * - contentType: 'both', budget: '30-100' → matches CPs where combinedRate is between 30-100
 */
const findCpsByContentAndBudget = async (
  contentType,
  minBudget,
  maxBudget
) => {
  let rateField;
  let contentMatch;

  switch (contentType.toLowerCase()) {
    case 'photo':
    case 'photography':
      rateField = 'photographyRate';
      contentMatch = 'photography';
      break;

    case 'video':
    case 'videography':
      rateField = 'videographyRate';
      contentMatch = 'videography';
      break;

    case 'both':
      rateField = 'combinedRate';
      break;

    default:
      throw new Error('Invalid content type');
  }

  // Build content type filter
  let contentTypeFilter;
  if (contentType.toLowerCase() === 'both') {
    // For "both", we don't filter by content_type at all
    // Instead, we rely on combinedRate being set
    // CPs set combinedRate when they offer both services
    contentTypeFilter = {};
  } else {
    contentTypeFilter = { content_type: { $in: [contentMatch] } };
  }

  const query = {
    ...contentTypeFilter,
    [rateField]: {
      $exists: true,
      $ne: null,
    },
  };

  // For backwards compatibility, we need to handle both string and number rates
  // Use aggregation to convert string rates to numbers for comparison
  const pipeline = [
    { $match: query },
    {
      $addFields: {
        [`${rateField}Numeric`]: {
          $cond: {
            if: { $eq: [{ $type: `$${rateField}` }, 'string'] },
            then: { $toDouble: `$${rateField}` },
            else: `$${rateField}`,
          },
        },
      },
    },
    {
      $match: {
        [`${rateField}Numeric`]: {
          $gte: minBudget,
          $lte: maxBudget,
        },
      },
    },
  ];

  return CP.aggregate(pipeline);
};

/**
 * Calculate tier score
 * @param {String} tier - CP tier (bronze, silver, gold, platinum)
 * @returns {Number} - Tier score (0-100)
 */
const calculateTierScore = (tier) => {
  const tierMap = {
    bronze: 25,
    silver: 50,
    gold: 75,
    platinum: 100,
  };
  return tierMap[tier?.toLowerCase()] || 0;
};

/**
 * Calculate recent activity score
 * @param {Date} lastActiveAt - Last active date
 * @returns {Number} - Activity score (0-100)
 */
const calculateActivityScore = (lastActiveAt) => {
  if (!lastActiveAt) return 0;

  const now = new Date();
  const daysSinceActive = Math.floor(
    (now - new Date(lastActiveAt)) / (1000 * 60 * 60 * 24)
  );

  // Score decreases with inactivity
  // 0-7 days: 100, 8-30 days: 80, 31-60 days: 50, 61-90 days: 25, >90 days: 0
  if (daysSinceActive <= 7) return 100;
  if (daysSinceActive <= 30) return 80;
  if (daysSinceActive <= 60) return 50;
  if (daysSinceActive <= 90) return 25;
  return 0;
};

/**
 * Calculate weighted ranking score for a CP
 * @param {Object} cp - CP document
 * @param {Number} distance - Distance in kilometers (optional)
 * @returns {Number} - Ranking score (0-100)
 *
 * Weighting:
 * - Distance: 20% (closer is better, max 50km)
 * - Rating: 25% (0-5 scale)
 * - Acceptance Rate: 20% (0-100%)
 * - Trust Score: 20% (0-100)
 * - Tier: 10% (bronze to platinum)
 * - Recent Activity: 5% (days since last active)
 */
const calculateRankingScore = (cp, distance = null) => {
  let score = 0;

  // 1. Distance Score (20%) - closer is better
  if (distance !== null && distance !== undefined) {
    const maxDistance = 50; // 50km as max
    const distanceScore = Math.max(0, 100 - (distance / maxDistance) * 100);
    score += distanceScore * 0.2;
  } else {
    // If no distance provided, give neutral score
    score += 50 * 0.2; // 50% of max distance score
  }

  // 2. Rating Score (25%) - 0-5 scale converted to 0-100
  const ratingScore = ((cp.average_rating || 0) / 5) * 100;
  score += ratingScore * 0.25;

  // 3. Acceptance Rate Score (20%)
  const acceptanceRate = cp.rates?.acceptanceRate || 0;
  score += acceptanceRate * 0.2;

  // 4. Trust/Reliability Score (20%)
  const trustScore = cp.trust_score || 0;
  score += trustScore * 0.2;

  // 5. Tier Score (10%)
  const tierScore = calculateTierScore(cp.tier);
  score += tierScore * 0.1;

  // 6. Recent Activity Score (5%)
  const activityScore = calculateActivityScore(cp.last_active_at);
  score += activityScore * 0.05;

  return Math.round(score * 100) / 100; // Round to 2 decimal places
};

/**
 * Find CPs by content type and budget with advanced ranking and filtering
 * @param {Object} options - Filter and ranking options
 * @returns {Promise<Array>} - Array of ranked CPs with scores
 */
const findCpsByContentAndBudgetWithRanking = async (options) => {
  const {
    contentType,
    minBudget,
    maxBudget,
    lat,
    lng,
    maxDistance,
    minRating,
    minAcceptanceRate,
    minTrustScore,
    tier,
    maxInactiveDays,
    sortBy,
    sortOrder,
  } = options;

  // Determine rate field based on content type
  let rateField;
  let contentMatch;

  switch (contentType.toLowerCase()) {
    case 'photo':
    case 'photography':
      rateField = 'photographyRate';
      contentMatch = 'photography';
      break;

    case 'video':
    case 'videography':
      rateField = 'videographyRate';
      contentMatch = 'videography';
      break;

    case 'both':
      rateField = 'combinedRate';
      break;

    default:
      throw new Error('Invalid content type');
  }

  // Build content type filter - handle multiple formats
  let contentTypeCondition;
  if (contentType.toLowerCase() === 'both') {
    // For "both", we don't filter by content_type at all
    // Instead, we rely on combinedRate being set
    // CPs set combinedRate when they offer both services
    contentTypeCondition = {};
  } else {
    contentTypeCondition = { content_type: { $in: [contentMatch] } };
  }

  // Build base query (not used in aggregation, kept for reference)
  const query = {
    ...contentTypeCondition,
    [rateField]: {
      $exists: true,
      $ne: null,
      $gte: minBudget,
      $lte: maxBudget,
    },
  };

  // Add filter conditions
  if (minRating !== null) {
    query.average_rating = { $gte: minRating };
  }

  if (minAcceptanceRate !== null) {
    query['rates.acceptanceRate'] = { $gte: minAcceptanceRate };
  }

  if (minTrustScore !== null) {
    query.trust_score = { $gte: minTrustScore };
  }

  if (tier) {
    const tierLevels = ['bronze', 'silver', 'gold', 'platinum'];
    const tierIndex = tierLevels.indexOf(tier.toLowerCase());
    if (tierIndex !== -1) {
      query.tier = { $in: tierLevels.slice(tierIndex) };
    }
  }

  if (maxInactiveDays !== null) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxInactiveDays);
    query.last_active_at = { $gte: cutoffDate };
  }

  // Build aggregation pipeline
  const pipeline = [];

  // If distance filtering is required, start with $geoNear
  if (lat !== null && lng !== null) {
    // Build the base query without dynamic field names
    const geoQuery = {
      ...contentTypeCondition,
      ...(minRating !== null && { average_rating: { $gte: minRating } }),
      ...(minAcceptanceRate !== null && {
        'rates.acceptanceRate': { $gte: minAcceptanceRate },
      }),
      ...(minTrustScore !== null && {
        trust_score: { $gte: minTrustScore },
      }),
      ...(tier && {
        tier: {
          $in: ['bronze', 'silver', 'gold', 'platinum'].slice(
            ['bronze', 'silver', 'gold', 'platinum'].indexOf(
              tier.toLowerCase()
            )
          ),
        },
      }),
      ...(maxInactiveDays !== null && {
        last_active_at: {
          $gte: new Date(
            Date.now() - maxInactiveDays * 24 * 60 * 60 * 1000
          ),
        },
      }),
    };

    // Add static rate field existence check based on contentType
    if (rateField === 'photographyRate') {
      geoQuery.photographyRate = { $exists: true, $ne: null };
    } else if (rateField === 'videographyRate') {
      geoQuery.videographyRate = { $exists: true, $ne: null };
    } else if (rateField === 'combinedRate') {
      geoQuery.combinedRate = { $exists: true, $ne: null };
    }

    pipeline.push({
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        distanceField: 'distance',
        distanceMultiplier: 0.001, // Convert meters to kilometers
        maxDistance: maxDistance * 1000,
        spherical: true,
        query: geoQuery,
      },
    });
  } else {
    // Start with $match for non-geo queries
    const matchQuery = {
      ...contentTypeCondition,
      ...(minRating !== null && { average_rating: { $gte: minRating } }),
      ...(minAcceptanceRate !== null && {
        'rates.acceptanceRate': { $gte: minAcceptanceRate },
      }),
      ...(minTrustScore !== null && {
        trust_score: { $gte: minTrustScore },
      }),
      ...(tier && {
        tier: {
          $in: ['bronze', 'silver', 'gold', 'platinum'].slice(
            ['bronze', 'silver', 'gold', 'platinum'].indexOf(
              tier.toLowerCase()
            )
          ),
        },
      }),
      ...(maxInactiveDays !== null && {
        last_active_at: {
          $gte: new Date(
            Date.now() - maxInactiveDays * 24 * 60 * 60 * 1000
          ),
        },
      }),
    };

    // Add static rate field existence check based on contentType
    if (rateField === 'photographyRate') {
      matchQuery.photographyRate = { $exists: true, $ne: null };
    } else if (rateField === 'videographyRate') {
      matchQuery.videographyRate = { $exists: true, $ne: null };
    } else if (rateField === 'combinedRate') {
      matchQuery.combinedRate = { $exists: true, $ne: null };
    }

    pipeline.push({
      $match: matchQuery,
    });
  }

  // Add stage to convert string rate to number and filter by budget
  pipeline.push({
    $addFields: {
      [`${rateField}Numeric`]: {
        $cond: {
          if: { $eq: [{ $type: `$${rateField}` }, 'string'] },
          then: { $toDouble: `$${rateField}` },
          else: `$${rateField}`,
        },
      },
    },
  });

  // Filter by budget range
  pipeline.push({
    $match: {
      [`${rateField}Numeric`]: {
        $gte: minBudget,
        $lte: maxBudget,
      },
    },
  });

  // Join with User collection to get user details
  pipeline.push({
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user'
    }
  });

  // Unwind user array to object
  pipeline.push({
    $unwind: {
      path: '$user',
      preserveNullAndEmptyArrays: true
    }
  });

  // Add user fields to the result
  pipeline.push({
    $addFields: {
      userDetails: {
        id: '$user._id',
        name: '$user.name',
        email: '$user.email',
        location: '$user.location',
        profile_picture: '$user.profile_picture',
        role: '$user.role',
        socialProvider: '$user.socialProvider',
        isEmailVerified: '$user.isEmailVerified',
        createdAt: '$user.createdAt',
        updatedAt: '$user.updatedAt'
      }
    }
  });

  // Remove the raw user field to clean up response
  pipeline.push({
    $project: {
      user: 0
    }
  });

  // Execute aggregation
  const cps = await CP.aggregate(pipeline);

  // Calculate ranking score for each CP
  const rankedCps = cps.map((cp) => {
    const distance = cp.distance !== undefined ? cp.distance : null;
    const rankingScore = calculateRankingScore(cp, distance);
    return {
      ...cp,
      distance,
      rankingScore,
      rankingBreakdown: {
        distanceScore: distance !== null
          ? Math.max(0, 100 - (distance / 50) * 100)
          : 50,
        ratingScore: ((cp.average_rating || 0) / 5) * 100,
        acceptanceRateScore: cp.rates?.acceptanceRate || 0,
        trustScore: cp.trust_score || 0,
        tierScore: calculateTierScore(cp.tier),
        activityScore: calculateActivityScore(cp.last_active_at),
      },
    };
  });

  // Sort based on sortBy parameter
  rankedCps.sort((a, b) => {
    let compareValue = 0;

    switch (sortBy) {
      case 'distance':
        compareValue = (a.distance || Infinity) - (b.distance || Infinity);
        break;
      case 'rating':
        compareValue = (b.average_rating || 0) - (a.average_rating || 0);
        break;
      case 'acceptanceRate':
        compareValue =
          (b.rates?.acceptanceRate || 0) - (a.rates?.acceptanceRate || 0);
        break;
      case 'trustScore':
        compareValue = (b.trust_score || 0) - (a.trust_score || 0);
        break;
      case 'ranking':
      default:
        compareValue = b.rankingScore - a.rankingScore;
        break;
    }

    return sortOrder === 'asc' ? -compareValue : compareValue;
  });

  return rankedCps;
};


module.exports = {
  createCP,
  queryCPs,
  getCpById,
  getCpByUserId,
  updateCpByUserId,
  deleteCpByUserId,
  updateCpById,
  deleteCpById,
  calculateCpRates,
  getCpWithUserData,
  findCpsByContentAndBudget,
  findCpsByContentAndBudgetWithRanking,
};
