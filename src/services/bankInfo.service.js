const httpStatus = require("http-status");
const { BankInfo } = require("../models");
const ApiError = require("../utils/ApiError");

const mongoose = require("mongoose");

const saveBankInfo = async (bodyData) => {
  // Create a new BankInfo with the orderBody
  const bankInfo = await BankInfo.create(bodyData);
  // Save the BankInfo
  await bankInfo.save();
  return bankInfo;
};
//
const updateBankInfoById = async (bankInfoId, updateData) => {
  // Find the document by its _id and update it
  const updatedBankInfo = await BankInfo.findByIdAndUpdate(
    bankInfoId,
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedBankInfo) {
    throw new Error("BankInfo not found.");
  }

  return updatedBankInfo;
};
//
const getAllBankInfo = async (filter, options) => {
  const bankInfo = await BankInfo.paginate(filter, options);
  return bankInfo;
};
//
const getBankInfoByUserId = async (userId) => {
  //   const bankInfo = await BankInfo.find({ userId }).populate("userId");
  const bankInfo = await BankInfo.find({ userId });
  return bankInfo;
};
//
const deleteBankInfoById = async (id) => {
  const bankInfo = await BankInfo.findById(id);
  if (!bankInfo) {
    throw new ApiError(httpStatus.NOT_FOUND, "BankInfo not found");
  }
  await bankInfo.deleteOne();
  return bankInfo;
};

module.exports = {
  saveBankInfo,
  getBankInfoByUserId,
  deleteBankInfoById,
  updateBankInfoById,
  getAllBankInfo,
};
