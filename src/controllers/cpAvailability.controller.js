const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const pick = require("../utils/pick");
const { cpAvailabilityService, orderService } = require("../services");
const ApiError = require("../utils/ApiError");

const createSchedule = catchAsync(async (req, res) => {
  //Get order data
  const scheduleData = req.body;
  const schedule = await cpAvailabilityService.createSchedule(scheduleData);
  res.status(httpStatus.CREATED).json(schedule);
});

//
const getSchedule = catchAsync(async (req, res) => {
  const { cp_ids } = await orderService.getOrderById(req.query.orderId);
  const options = pick(req.query, ["sortBy", "limit", "page", "populate"]);
  const filter = { cp_id: { $in: cp_ids.map((cp) => cp.id) } };
  const result = await cpAvailabilityService.querySchedule(filter, options);
  res.send(result);
});

//
const getScheduleByCpId = catchAsync(async (req, res) => {
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await cpAvailabilityService.getScheduleByCpId(
    options,
    req.params.cpId
  );
  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Schedule not found");
  }
  res.send(result);
});
// DELETE schedule

const deleteScheduleById = catchAsync(async (req, res) => {
  const schedule = await cpAvailabilityService.deleteScheduleById(
    req.params.id
  );
  if (!schedule) {
    throw new ApiError(httpStatus.NOT_FOUND, "Schedule not found");
  }
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createSchedule,
  getSchedule,
  getScheduleByCpId,
  deleteScheduleById,
};
