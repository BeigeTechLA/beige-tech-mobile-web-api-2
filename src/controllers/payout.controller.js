const httpStatus = require("http-status");
const pick = require("../utils/pick");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { payoutService } = require("../services");

const createWithdrawRequest = catchAsync(async (req, res) => {
  const payoutData = req.body;
  const payoutReq = await payoutService.createWithdrawRequest(payoutData);
  res.status(httpStatus.CREATED).json(payoutReq);
});
//
const getAllPayouts = catchAsync(async (req, res) => {
  const requestQuery = req.query;
  const filter = pick(requestQuery, ["userId", "id", "date"]);
  const options = pick(requestQuery, ["sortBy", "limit", "page", "populate"]);
  const result = await payoutService.getAllPayouts(filter, options);
  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Bank Information not found");
  }
  res.send(result);
});
//
const updatePayoutData = catchAsync(async (req, res) => {
  const payoutInfo = await payoutService.updatePayoutData(
    req.params.id,
    req.body
  );

  // If the status is paid, format the response with billing and transaction details
  if (
    payoutInfo.status === "paid" &&
    payoutInfo.invoiceId &&
    payoutInfo.transactionId
  ) {
    // Format the payment date
    const paymentDate = payoutInfo.paymentDate
      ? new Date(payoutInfo.paymentDate)
      : new Date();
    const formattedPaymentDate = `${paymentDate.getDate()} ${paymentDate.toLocaleString(
      "en-US",
      { month: "short" }
    )}, ${paymentDate.getFullYear()}`;

    // Format the request date
    const requestDate = payoutInfo.date
      ? new Date(payoutInfo.date)
      : new Date(payoutInfo.createdAt);
    const formattedRequestDate = `${requestDate.getDate()} ${requestDate.toLocaleString(
      "en-US",
      { month: "short" }
    )}, ${requestDate.getFullYear()}`;

    // Create a formatted response with billing and transaction details
    const formattedResponse = {
      ...(payoutInfo.toJSON ? payoutInfo.toJSON() : payoutInfo),
      billingOverview: {
        invoice: payoutInfo.invoiceId,
        date: formattedRequestDate,
        amount: `$${payoutInfo.withdrawAmount}`,
        status: payoutInfo.status,
      },
      transactionSummary: {
        invoiceNumber: payoutInfo.invoiceId,
        paymentMethod: payoutInfo.paymentMethod || "Bank Transfer",
        transactionId: payoutInfo.transactionId,
        paymentDate: formattedPaymentDate,
        totalPaid: `$${payoutInfo.withdrawAmount}`,
      },
    };

    return res.send(formattedResponse);
  }

  // For other statuses, return the regular response
  res.send(payoutInfo);
});
//
const deletePayoutById = async (req, res) => {
  const payoutId = req.params.id;
  await payoutService.deletePayoutById(payoutId);
  res.status(httpStatus.NO_CONTENT).send();
};
module.exports = {
  createWithdrawRequest,
  getAllPayouts,
  updatePayoutData,
  deletePayoutById,
};
