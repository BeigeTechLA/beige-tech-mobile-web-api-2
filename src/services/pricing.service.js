const { Price } = require("../models");
const mongoose = require("mongoose");

/**
 * Create a price
 * @param {Object} priceBody
 * @returns {Promise<price>}
 */

const createPrices = async (priceBody) => {
  // Create a new price with the priceBody
  const price = await Price.create(priceBody);
  // Save the price
  await price.save();
  return price;
};

const getPrices = async (filter, options) => {
  // const orders = await Order.paginate(filter, options);
  const prices = await Price.paginate(filter, options);
  return prices;
};

const getPriceById = async (id) => {
  // return Price.findById(id).populate("meeting_date_times");
  return Price.findById(id);
};

const updatePriceById = async (priceId, updateBody) => {
  try {
    //Fetch and check order
    const price = await getPriceById(priceId);
    if (!price) {
      throw new ApiError(httpStatus.NOT_FOUND, "Price  not found");
    }
    Object.assign(price, updateBody);
    await price.save();
    return price;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid  ID");
    }
    throw error;
  }
};

module.exports = {
  createPrices,
  getPrices,
  updatePriceById,
  getPriceById,
};
