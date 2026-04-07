const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const { Order, CP, AlgoSetting, User } = require("../models");
const deepCopy = require("../utils/deepCopy");

const criterias = {
  //direct matches from order
  content_type: {
    weight: 4,
  },
  content_vertical: {
    //TODO: this is an array, so have to assign score based on the number of matches
    weight: 3,
  },
  vst: {
    //TODO: this is an array, so have to assign score based on the number of matches
    weight: 3,
  },

  avg_rating: {
    weight: 3,
  },

  // For later
  /*
  shoot_availability: {
    TODO NEED TO ADD IN MODEL
    weight: 5,
  },
  avg_response_time: {
    // ! How do we calculate this?
    weight: 3,
  },
  successful_beige_shoots: {
    weight: 2,
  },
  trust_score: {
    // ! How do we calculate this?
    weight: 2,
  },
  last_beige_shoot: {
    // ! How do we calculate this?
    weight: 2,
  },
  transportation_methods: {
    // ! How do we calculate this?
    weight: 2,
  },

  customer_service_experience: {
    weight: 2,
  },
  reference: {
    weight: 0, // TBD
  },

  equipment: {
    weight: 4,
  },
  no_shows: {
    weight: 4,
  },
  city: {
    weight: 3,
  },
  content_verticals: {
    weight: 3,
  },
  equipment_specific: {
    TODO NEED TO ADD IN MODEL
    weight: 3,
  },
  portfolio: {
    weight: 3,
  },
  avg_response_time_new_shoot: {
    TODO NEED TO ADD IN MODEL
    weight: 3,
  },
  neighborhood_zip_code: {
    TODO NEED TO ADD IN MODEL
    weight: 2,
  },

  declined_shoots: {
    weight: 2,
  },
  accepted_shoots: {
    weight: 2,
  },
  total_earnings: {
    weight: 1,
  },
  timezone: {
    TODO NEED TO ADD IN MODEL
    weight: 1,
  },
  backup_footage: {
    weight: 1,
  },
  travel_to_distant_shoots: {
    weight: 1,
  },
  experience_post_production: {
    weight: 1,
  },
  team_player: {
    weight: 1,
  },
  category: {
    weight: 0, // not specified
  },
  */
};

const matchOrderWithCp = async (queryParams) => {
  const orderID = queryParams?.orderID;
  const page = parseInt(queryParams?.page) || 1;
  const limit = parseInt(queryParams?.limit) || 10; // Default limit to 10 if not provided
  const skip = (page - 1) * limit;
  // 1. Get the order details from the order id
  const order = await Order.findById(orderID);
  const allParams = await getParams();
  const { search } = allParams[0];

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  // 2. Get the nearest CPs from the order location
  let maxDistanceInMeters = 50000; // Initial maximum distance (50 kilometers)
  let nearestCPs = [];

  while (maxDistanceInMeters <= 200000 && nearestCPs.length === 0) {
    // Adjust the maximum distance as needed
    nearestCPs = await CP.find({
      geo_location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: order.geo_location.coordinates,
          },
          $maxDistance: maxDistanceInMeters,
        },
      },
    });

    if (nearestCPs.length === 0) {
      console.log(`No CPs found within ${maxDistanceInMeters / 1000} km.`);
      maxDistanceInMeters += 50000; // Increment by 50 kilometers
    }
  }

  // if (nearestCPs.length === 0) {
  //   throw new ApiError(httpStatus.NOT_FOUND, "No nearby cps found in 200 km");
  // }

  // 3. Match the order with the CPs based on the algorithm matching criteria object.
  const cpScores = [];
  for (const cp of nearestCPs) {
    let criteria = deepCopy(search);
    // content_vertical
    if (cp.content_verticals.includes(order.content_vertical)) {
      criteria.content_vertical.score = 1;
    }
    // content_type
    const matchedTypes = order.content_type.filter((type) =>
      cp.content_type.includes(type)
    );
    if (matchedTypes.length === order.content_type.length) {
      criteria.content_type.score = 1;
    } else if (matchedTypes.length > 0) {
      const partialScore = matchedTypes.length / order.content_type.length;
      criteria.content_type.score = partialScore;
    }
    // vst
    const matchedVST = order.vst.filter((vst) => cp.vst.includes(vst));
    if (matchedVST.length === order.vst.length) {
      criteria.vst.score = 1;
    } else if (matchedVST.length > 0) {
      const partialScore = matchedVST.length / order.vst.length;
      criteria.vst.score = partialScore;
    }
    // Team player
    if (cp.team_player) {
      criteria.team_player.score = 1;
    }
    // avg rating
    criteria.average_rating.score = cp.average_rating;

    // avg response time
    criteria.avg_response_time.score = cp.avg_response_time;

    // successful beige shoots
    criteria.successful_beige_shoots.score = cp.successful_beige_shoots;
    // New
    // customer_service_experience
    if (cp.customer_service_skills_experience) {
      criteria.customer_service_experience.score = 1;
    }
    // equipment
    if (cp.equipment.length) {
      criteria.equipment.score = cp.equipment.length;
    }
    // equipment_specific
    if (cp.equipment_specific.length) {
      criteria.equipment_specific.score = cp.equipment_specific.length / 2;
    }

    // city
    if (cp.city === order.location) {
      criteria.city.score = 1;
    }
    // portfolio
    if (cp.portfolio.length) {
      criteria.portfolio.score = 1;
    }
    // declined_shoots
    if (cp.num_declined_shoots) {
      criteria.declined_shoots.score = cp.num_declined_shoots;
    }
    // accepted_shoots
    if (cp.num_accepted_shoots) {
      criteria.accepted_shoots.score = cp.num_accepted_shoots;
    }
    // total_earnings
    if (cp.total_earnings > 5000) {
      criteria.total_earnings.score = 2;
    } else if (cp.total_earnings > 2000) {
      criteria.total_earnings.score = 1;
    }
    // backup_footage
    if (cp.backup_footage.length) {
      criteria.backup_footage.score = cp.backup_footage.length;
    }
    // travel_to_distant_shoots
    if (cp.travel_to_distant_shoots) {
      criteria.travel_to_distant_shoots.score = 1;
    }
    // experience_post_production
    if (cp.experience_with_post_production_edit) {
      criteria.experience_post_production.score = 1;
    }
    // no_shows
    // if (cp.num_no_shows) {
    //   criteria.no_shows.score = -cp.num_no_shows;
    // }

    // Calculate the weighted average score for every criteria
    let totalWeight = 0;
    let totalScore = 0;
    for (const [key, value] of Object.entries(criteria)) {
      totalWeight += value.weight;
      totalScore += value.weight * value.score;
    }
    let weightedAverageScore = totalScore / totalWeight;

    cpScores.push({ weightedAverageScore, criteria, cp });
  }

  // 4. Sort the CPs based on the total score.
  cpScores.sort((a, b) => b.weightedAverageScore - a.weightedAverageScore);

  // 5. Return the top 3 CPs only.
  // const topCPs = cpScores.slice(0, 3).map(({ cp }) => cp);
  // // Top CP's userId with criteria
  // const topCPs = cpScores.map(({ cp, criteria, weightedAverageScore }) => ({
  //   userId: cp.userId,
  //   weightedAverageScore,
  //   // criteria,
  // }));
  // // return topCPs;

  //* 5. Paginate the CPs based on the provided page and limit
  const paginatedCPs = cpScores.slice(skip, skip + limit);
  
  // Extract userIds from paginated CPs
  const userIds = paginatedCPs.map(({ cp }) => cp.userId);

  // Retrieve user details for the extracted userIds
  // Retrieve user details for the extracted userIds
  const users = await User.find({ _id: { $in: userIds } }).select(
    "role isEmailVerified name email profile_picture"
  );

  // Map user details back to paginated CPs
  const results = paginatedCPs.map(({ cp, weightedAverageScore }) => {
    const user = users.find((user) => user._id.equals(cp.userId));
    return {
      ...cp.toObject(), // Convert CP object to plain JavaScript object
      userId: user.toObject(), // Convert User object to plain JavaScript object
      weightedAverageScore,
    };
  });

  return {
    results: results,
    page: page,
    limit: limit,
    totalPages: Math.ceil(cpScores.length / limit),
    totalResults: cpScores.length,
  };
};

// Create new params for setting criteria
const createAlgoPrams = async (algoBody) => {
  // Create a new params with the algoBody
  const algoParams = await AlgoSetting.create(algoBody);
  // Save params
  await algoParams.save();
  return algoParams;
};

const getParamsById = async (id) => {
  // return Price.findById(id).populate("meeting_date_times");
  return AlgoSetting.findById(id);
};
// Update params by Id
const updateParamsById = async (paramsId, updateBody) => {
  try {
    //Fetch and check order
    const algoParams = await getParamsById(paramsId);
    Object.assign(algoParams, updateBody);
    await algoParams.save();
    return algoParams;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Params ID");
    }
    throw error;
  }
};

const getParams = async () => {
  // const orders = await Order.paginate(filter, options);
  const algoParams = await AlgoSetting.find();
  return algoParams;
};

//
module.exports = {
  matchOrderWithCp,
  createAlgoPrams,
  updateParamsById,
  getParams,
};
