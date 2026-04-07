const catchAsync = require("../utils/catchAsync");
const { addOnsService } = require("../services");
const httpStatus = require("http-status");
const { AddOns } = require("../models");

const createAddOns = catchAsync(async (req, res) => {
  // Get add-ons data from request body
  const addOnsData = req.body;
  const newAddOns = await addOnsService.createAddOns(addOnsData);
  res.status(httpStatus.CREATED).json(newAddOns);
});

// Get all prices
const getAllAddOns = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const result = await addOnsService.getAllAddOns(requestQuery);
  res.send(result);
});
// getAddOnById
const getAddOnById = catchAsync(async (req, res) => {
  const addOnId = req.params.addOnId;
  const result = await addOnsService.getAddOnById(addOnId);
  res.json(result);
});

// update addOns by id
const updateAddOnsById = catchAsync(async (req, res) => {
  const addOnId = req.params.addOnId;
  const result = await addOnsService.updateAddOnsById(addOnId, req.body);
  res.json(result);
});
// delete addOns by id

const deleteAddOnById = catchAsync(async (req, res) => {
  await addOnsService.deleteAddOnById(req.params.addOnId);
  res.status(httpStatus.NO_CONTENT).send();
});

// Get all unique addon categories
const getAllAddOnCategories = catchAsync(async (req, res) => {
  const categories = await addOnsService.getAllAddOnCategories();
  res.json(categories);
});

module.exports = {
  createAddOns,
  getAllAddOns,
  updateAddOnsById,
  deleteAddOnById,
  getAddOnById,
  getAllAddOnCategories,
};
