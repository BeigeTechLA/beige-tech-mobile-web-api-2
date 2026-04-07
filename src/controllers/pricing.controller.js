const catchAsync = require("../utils/catchAsync");
const { pricingService } = require("../services");
const httpStatus = require("http-status");
const pick = require("../utils/pick");

const createPricing = catchAsync(async (req, res) => {
  const pricingData = req.body;
  //Create price record
  const price = await pricingService.createPrices(pricingData);
  res.status(httpStatus.CREATED).json(price);
});

// Get all prices
const getPrices = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const filter = pick(requestQuery, ["title", "rate", "tag", "status"]);
  const options = pick(requestQuery, ["sortBy", "limit", "page", "populate"]);
  const result = await pricingService.getPrices(filter, options);
  res.send(result);
});
// getPriceById
const getPriceById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const price = await pricingService.getPriceById(id);
  res.status(httpStatus.OK).json(price);
});
// update price
const updatePriceById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const pricingData = req.body;
  const price = await pricingService.updatePriceById(id, pricingData);
  res.status(httpStatus.OK).json(price);
});

module.exports = {
  createPricing,
  getPrices,
  updatePriceById,
  getPriceById,
};
