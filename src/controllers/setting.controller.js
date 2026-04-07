const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { settingService } = require("../services");
const { Settings } = require("../models");

/**
 * Retrieves search algorithm parameters.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @throws {ApiError} If search algorithm parameters are not configured, it throws a NOT_FOUND error.
 */
const getSearchAlgoParams = catchAsync(async (req, res) => {
  const algoParams = await settingService.getSearchAlgoParams();
  if (!algoParams) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Search algorithm parameters are not configured. Please configure the search algorithm parameters to enable this feature."
    );
  }
  res.send(algoParams);
});

/**
 * Updates Search Algorithm Parameters
 *
 * @param {object} req - Express request object containing the updated parameters.
 * @param {object} res - Express response object.
 */
const updateSearchAlgoParams = catchAsync(async (req, res) => {
  const updatedSearchAlgoParams = await settingService.updateSearchAlgoParams(
    req.body
  );
  res.send(updatedSearchAlgoParams);
});

//
const createBasicSettings = catchAsync(async (req, res) => {
  try {
    const role = req.query.role; // Assuming role is stored in req.query.role
    const settingsData = req.body;
    const existSettings = await Settings.find();

    if (role === "admin") {
      // Additional code specific to the manager role
      if (existSettings.length > 0) {
        const updatedPrices = await settingService.updateSettingById(
          existSettings[0]._id,
          settingsData
        );
        res.send(updatedPrices);
      } else {
        const allSettings = await settingService.createBasicSettings(
          settingsData
        );
        res.status(httpStatus.CREATED).json(allSettings);
      }
    } else {
      // Code for other roles or a default behavior
      res
        .status(httpStatus.FORBIDDEN)
        .send("You do not have permission to perform this action.");
    }
  } catch (error) {
    console.error(error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
});

const getAllSettings = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const result = await settingService.getAllSettings();
  res.send(result[0]);
});

module.exports = {
  getSearchAlgoParams,
  updateSearchAlgoParams,
  createBasicSettings,
  getAllSettings,
};
