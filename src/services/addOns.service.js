const httpStatus = require("http-status");
const { AddOns } = require("../models");
const mongoose = require("mongoose");

/**
 * Create a price
 * @param {Object} addOnsBody
 * @returns {Promise<price>}
 */

const createAddOns = async (addOnsBody) => {
  // Create and save the new AddOns document
  const addOns = await AddOns.create(addOnsBody);
  await addOns.save();

  return addOns;
};

const getAllAddOns = async (query) => {
  let filter = { status: 1 };
  if (query && query.search) {
    filter.title = { $regex: query.search, $options: "i" }; // Case-insensitive search
  }
  if (query && query.category) {
    filter.category = query.category;
  }

  // Pagination parameters
  const page = parseInt(query.page, 10) || 1;
  // const limit = parseInt(query.limit, 10) || 100;
  const limit = 1000;
  const skip = (page - 1) * limit;

  // Get total count for pagination
  const totalCount = await AddOns.countDocuments(filter);

  // Get paginated results
  const addOns = await AddOns.find(filter).skip(skip).limit(limit);

  return {
    results: addOns,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
    totalResults: totalCount,
  };
};

const updateAddOnsById = async (id, updateBody) => {
  try {
    const updatedAddOn = await AddOns.findByIdAndUpdate(id, updateBody, {
      new: true,
      runValidators: true,
    });
    return updatedAddOn;
  } catch (error) {
    throw new Error(`Error updating add-on with ID ${id}: ${error.message}`);
  }
};

const getAddOnById = async (id) => {
  return AddOns.findById(id);
};

/**
 * Get all unique addon categories
 * @returns {Promise<Array>} Array of unique category names
 */
const getAllAddOnCategories = async () => {
  return AddOns.distinct("category", { status: 1 }).sort();
};
const deleteAddOnById = async (id) => {
  const addOn = await getAddOnById(id);
  if (!addOn) {
    throw new ApiError(httpStatus.NOT_FOUND, "AddOn not found");
  }
  await addOn.deleteOne();
  return addOn;
};

module.exports = {
  createAddOns,
  getAllAddOns,
  updateAddOnsById,
  deleteAddOnById,
  getAddOnById,
  getAllAddOnCategories,
};
