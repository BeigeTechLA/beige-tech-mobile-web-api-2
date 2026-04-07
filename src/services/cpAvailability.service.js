const httpStatus = require("http-status");
const { Availability } = require("../models");
const ApiError = require("../utils/ApiError");

/**
 * Create a order
 * @param {Object} timesBody
 * @returns {Promise<Order>}
 */
const createSchedule = async (timesBody) => {
  // Create a new order with the orderBody
  const schedule = await Availability.create(timesBody);
  // Save the order
  await schedule.save();

  return schedule;
};
const querySchedule = async (filter, options) => {
  const availability = await Availability.paginate(filter, options);
  return availability;
};
const getScheduleByCpId = async (options, cpId) => {
  const filter = {};
  filter.cp_id = cpId;
  options.sortBy = "createdAt:desc";
  options.populate = "sent_by";
  try {
    return await Availability.paginate(filter, options);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};
// deleteScheduleById

const deleteScheduleById = async (id) => {
  const availability = await Availability.findById(id);
  if (!availability) {
    throw new ApiError(httpStatus.NOT_FOUND, "Schedule Information not found");
  }
  await availability.deleteOne();
  return availability;
};

module.exports = {
  createSchedule,
  querySchedule,
  getScheduleByCpId,
  deleteScheduleById,
};
