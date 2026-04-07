const catchAsync = require("../utils/catchAsync");
const { algoService } = require("../services");
const { AlgoSetting } = require("../models");

const httpStatus = require("http-status");

const matchOrderWithCp = catchAsync(async (req, res) => {
  const options = req.query;
  const result = await algoService.matchOrderWithCp(options);
  res.send(result);
});

const setAlgoParams = catchAsync(async (req, res) => {
  //Get params data
  const paramsData = req.body;
  const prevParams = await AlgoSetting.find();
  if (prevParams.length > 0) {
    const updateAddOns = await algoService.updateParamsById(
      prevParams[0]._id,
      paramsData
    );
    res.send(updateAddOns);
  } else {
    //Create params record
    const algoParams = await algoService.createAlgoPrams(paramsData);
    res.status(httpStatus.CREATED).json(algoParams);
  }
});
//
const getAllParams = catchAsync(async (req, res) => {
  const result = await algoService.getParams();
  res.send(result[0]);
});

module.exports = {
  matchOrderWithCp,
  setAlgoParams,
  getAllParams,
};
