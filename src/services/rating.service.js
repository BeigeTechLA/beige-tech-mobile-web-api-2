/**
 Rating Service
 */
const {Rating, CP, Order} = require("../models");
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const httpStatus = require("http-status");

/**
 Get all ratings.
 @param {Object} options - Query options for pagination and sorting.
 @returns {Promise} A promise that resolves to paginated rating data.
 */
const getRatings = (options) => {
    try {
        options.populate = "rating_by rating_to";
        return Rating.paginate({}, options);
    } catch (error) {
        throw error;
    }
};

/**
 Get rating by ID.
 @param {string} ratingId - The ID of the rating.
 @returns {Promise} A promise that resolves to the rating data.
 */
const getRatingById = async (ratingId) => {
    try {
        const rating = await Rating.findById(ratingId);
        if (!rating) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Invalid rating ID 1");
        }
        return rating;
    } catch (error) {
        if (error instanceof mongoose.CastError) {
            throw new ApiError(httpStatus.BAD_REQUEST, "Invalid rating ID 2");
        }
        throw error;
    }
};

/**
 Get seller ratings.
 @param {Object} options - Query options for pagination and sorting.
 @returns {Promise} A promise that resolves to paginated seller ratings data.
 */
const getSellerRatings = async (options) => {
    try {
        const filter = {
            rating_type: "buyer_to_seller"
        };
        options.populate = "rating_by rating_to";
        return Rating.paginate(filter, options);
    } catch (error) {
        throw error;
    }
};

/**
 Get seller ratings by seller ID.
 @param {Object} options - Query options for pagination and sorting.
 @param {string} sellerId - The ID of the seller.
 @returns {Promise} A promise that resolves to paginated seller ratings data.
 */
const getSellerRatingsBySellerId = async (options, sellerId) => {
    try {
        const filter = {
            rating_type: "buyer_to_seller",
            rating_to: sellerId
        };
        options.populate = "rating_by rating_to";
        return Rating.paginate(filter, options);
    } catch (error) {
        throw error;
    }
};

/**
 Rate seller and update the average rating of the seller in CP collection
 @param {string} sellerId - The ID of the seller.
 @param {Object} ratingData - Data for creating the rating.
 @returns {Promise} A promise that resolves to the created rating data.
 */
const rateSeller = async (ratingData) => {

    ratingData.rating_type = "buyer_to_seller";
    const sellerId = ratingData.rating_to;

    //Validate if rating data is matched with the order data
    const checkValid = await checkRating(sellerId, ratingData.rating_by, ratingData.order_id);
    if (checkValid){
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid rating input provided');
    }

    //Validate duplicate rating
    const checkDuplicate = await checkDuplicateRating(sellerId, ratingData.order_id);
    if(!checkDuplicate){
        throw new ApiError(httpStatus.BAD_REQUEST, 'Duplicate rating data');
    }

    try {

        const createRating = await Rating.create(ratingData);
        const sellerAvgRating = await getAvgRating(sellerId);

        //Update seller average rating
        await CP.findOneAndUpdate(
            { userId: sellerId },
            { average_rating: sellerAvgRating }
        );

        ratingData.id = createRating.toObject()._id;
        ratingData.average_rating = sellerAvgRating;

        return ratingData;

    } catch (error) {
        throw error;
    }
};

/**
 Get buyer ratings.
 @param {Object} options - Query options for pagination and sorting.
 @returns {Promise} A promise that resolves to paginated buyer ratings data.
 */
const getBuyerRatings = async (options) => {
    try {
        const filter = {
            rating_type: "seller_to_buyer"
        };
        options.populate = "rating_by rating_to";
        return Rating.paginate(filter, options);
    } catch (error) {
        throw error;
    }
};

/**
 Get buyer ratings by buyer ID.
 @param {Object} options - Query options for pagination and sorting.
 @param {string} buyerId - The ID of the buyer.
 @returns {Promise} A promise that resolves to paginated buyer ratings data.
 */
const getBuyerRatingsByBuyerId = async (options, buyerId) => {
    try {
        const filter = {
            rating_type: "seller_to_buyer",
            rating_to: buyerId
        };
        options.populate = "rating_by rating_to";
        return Rating.paginate(filter, options);
    } catch (error) {
        throw error;
    }
};

/**
 Rate buyer.
 @param {string} buyerId - The ID of the buyer.
 @param {Object} ratingData - Data for creating the rating.
 @returns {Promise} A promise that resolves to the created rating data.
 */
const rateBuyer = async (ratingData) => {

    ratingData.rating_type = "seller_to_buyer";
    const buyerId = ratingData.rating_to;

    //Validate if rating data is matched with the order data
    const checkValid = await checkRating(ratingData.rating_by, buyerId, ratingData.order_id);
    if (checkValid){
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid rating input provided');
    }

    //Validate duplicate rating
    const checkDuplicate = await checkDuplicateRating(buyerId, ratingData.order_id);
    if(!checkDuplicate){
        throw new ApiError(httpStatus.BAD_REQUEST, 'Duplicate rating data');
    }

    try {
        return await Rating.create(ratingData);
    } catch (error) {
        throw error;
    }
};


/**
 Get the average rating of a User (CP and Client).
 @param {string} userId - The ID of the CP User.
 @returns {number} The average rating of the CP User. Returns 0 if no ratings found.
 @throws {ApiError} If there is an error while fetching the average rating.
 */
const getAvgRating = async (userId) => {
    try {

        //Fetch the average rating of the CP User
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const result = await Rating.aggregate([
            {
                $match: { rating_to: userIdObj }
            },
            {
                $group: {
                    _id: null,
                    average_rating: { $avg: "$rating" }
                }
            }
        ]);

        if (result.length === 0) {
            return 0;
        }

        return result[0].average_rating.toFixed(2);

    } catch (error) {
        throw error;
    }
}

/**
 * Check if a duplicate rating exists for the specified ratingTo and OrderId.
 * @param {string} ratingTo - The ID of the entity being rated.
 * @param {string} orderId - The ID of the order associated with the rating.
 * @returns {Promise<boolean>} A promise that resolves to true if no duplicate rating exists, false otherwise.
 * @throws {ApiError} If there is an error while checking for duplicate rating.
 */
const checkDuplicateRating = async (ratingTo, orderId) => {
    try {
        const existingRating = await Rating.findOne({
            rating_to: ratingTo,
            order_id: orderId
        });
        return !existingRating;
    } catch (error) {
        if (error instanceof mongoose.CastError) {
            throw new ApiError(httpStatus.BAD_REQUEST, error.message);
        }
        throw error;
    }
};

/**

 Check if a rating (order) exists based on the provided parameters.
 @param {string} cpId - The ID of the content creator (seller) to check for the rating.
 @param {string} clientId - The ID of the client who placed the order.
 @param {string} orderId - The ID of the order to check for the rating.
 @returns {boolean} Returns true if the rating (order) does not exist, and false if it exists.
 @throws {ApiError} If an error occurs while checking the rating.
 */
const checkRating = async (cpId, clientId, orderId) => {
    try {
        const targetOrder = await Order.findOne({
            _id: orderId,
            client_id: clientId,
            cp_id: cpId
        });
        return !targetOrder;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getRatings,
    getRatingById,
    getSellerRatings,
    getSellerRatingsBySellerId,
    rateSeller,
    getBuyerRatings,
    getBuyerRatingsByBuyerId,
    rateBuyer
};