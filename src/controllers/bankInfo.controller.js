const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { bankInfoService } = require("../services");
const { BankInfo } = require("../models");

const saveBankInfo = catchAsync(async (req, res) => {
  const bankInformation = req.body;
  const { userId } = bankInformation;
  // Check the number of existing accounts for the user
  const existingAccountsCount = await BankInfo.countDocuments({ userId });
  if (existingAccountsCount >= 4) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "The user has already saved two accounts. Cannot add a new BankInfo."
    );
  } else {
    const bankInfo = await bankInfoService.saveBankInfo(bankInformation);
    res.status(httpStatus.CREATED).json(bankInfo);
  }
});
//
const updateBankInfoById = catchAsync(async (req, res) => {
  const bankInfo = await bankInfoService.updateBankInfoById(
    req.params.id,
    req.body
  );
  res.send(bankInfo);
});
//
const getAllBankInfo = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const filter = pick(requestQuery, ["userId", "id"]);
  const options = pick(requestQuery, ["sortBy", "limit", "page", "populate"]);
  const result = await bankInfoService.getAllBankInfo(filter, options);
  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Bank Information not found");
  }
  res.send(result);
});
//
const getBankInfoByUserId = catchAsync(async (req, res) => {
  const bankInfo = await bankInfoService.getBankInfoByUserId(req.params.userId);
  if (!bankInfo) {
    throw new ApiError(httpStatus.NOT_FOUND, "Bank Information not found");
  }
  res.send(bankInfo);
});
//
const deleteBankInfoById = async (req, res) => {
  const bankInfoId = req.params.id;
  await bankInfoService.deleteBankInfoById(bankInfoId);
  res.status(httpStatus.NO_CONTENT).send();
};

module.exports = {
  saveBankInfo,
  getBankInfoByUserId,
  deleteBankInfoById,
  updateBankInfoById,
  getAllBankInfo,
};
