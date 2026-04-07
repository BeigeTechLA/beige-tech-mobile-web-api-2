const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");

const bankInfoValidator = (req, res, next) => {
  const info = req.body;

  if (!info.userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User id is required");
  }
  if (!info.accountType) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Account Type is required");
  }

  if (info.accountType === "debitCard") {
    if (!info.cardNumber) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Card Number is required");
    }
    if (!info.expireDate) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Expire Date is required");
    }
    if (!info.cvc) {
      throw new ApiError(httpStatus.BAD_REQUEST, "CVC is required");
    }
  } else {
    if (!info.accountHolder) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Account Holder is required");
    }
    if (!info.accountNumber) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Account Number is required");
    }
    if (!info.bankName) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Bank Name is required");
    }
    // if (!info.phoneNumber) {
    //   throw new ApiError(httpStatus.BAD_REQUEST, "Phone Number is required");
    // }
    if (!info.branchName) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Branch Name is required");
    }
  }
  next();
};

module.exports = bankInfoValidator;
