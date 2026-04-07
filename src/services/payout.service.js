const httpStatus = require("http-status");
const { Payout, CP, User } = require("../models");
const ApiError = require("../utils/ApiError");
const { sendNotification } = require("../services/fcm.service");
const { createNotificationData } = require('../services/notification.service');

const createWithdrawRequest = async (bodyData) => {
  // Create a new BankInfo with the orderBody
  const payout = await Payout.create(bodyData);
  // Save the BankInfo
  await payout.save();

  // Create transaction record for withdrawal (pending status)
  const transactionService = require("./transaction.service");
  await transactionService.createWithdrawalTransaction(payout._id);

  return payout;
};
//

const getAllPayouts = async (filter, options = {}) => {
  try {
    // Set default pagination options
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get total count for pagination
    const totalResults = await Payout.countDocuments(filter);
    const totalPages = Math.ceil(totalResults / limit);
    
    // Execute query with manual pagination
    let query = Payout.find(filter)
      .sort(options.sortBy || '-createdAt')
      .skip(skip)
      .limit(limit);
    
    // Add populate for user data
    query = query.populate('userId', 'name email profile_picture');
    
    const payouts = await query.exec();
    
    // If no results, return empty array with pagination info
    if (!payouts || payouts.length === 0) {
      return {
        results: [],
        page,
        limit,
        totalPages,
        totalResults
      };
    }
    
    // Transform the data to include user information in a more structured way
    const transformedResults = payouts.map(payout => {
      const userData = payout.userId || {};
      const payoutObj = payout.toJSON ? payout.toJSON() : payout;
      
      return {
        ...payoutObj,
        user: {
          id: userData._id || '',
          name: userData.name || 'Unknown User',
          email: userData.email || '',
          profile_image: userData.profile_picture || ''
        }
      };
    });
    
    return {
      results: transformedResults,
      page,
      limit,
      totalPages,
      totalResults
    };
  } catch (error) {
    console.error('Error fetching payouts:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error fetching payouts');
  }
};
//

const updatePayoutData = async (payoutId, updateData) => {
  // Check if status is being updated to paid
  if (updateData && updateData.status === "paid") {
    // Find the latest invoice to generate the next invoice number
    const currentYear = new Date().getFullYear();
    const latestInvoice = await Payout.findOne({ 
      invoiceId: { $regex: `#INV-${currentYear}` },
      status: "paid"
    }).sort({ invoiceId: -1 });
    
    let nextInvoiceNumber = 1;
    if (latestInvoice && latestInvoice.invoiceId) {
      // Extract the number from the latest invoice ID
      const match = latestInvoice.invoiceId.match(/#INV-\d{4}-(\d{3})/);
      if (match && match[1]) {
        nextInvoiceNumber = parseInt(match[1], 10) + 1;
      }
    }
    
    // Format the invoice ID with padded zeros
    const invoiceId = `#INV-${currentYear}-${nextInvoiceNumber.toString().padStart(3, '0')}`;
    
    // Generate transaction ID (format: TXN-XXXXXXXXX)
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
    const transactionId = `TXN-${randomDigits}`;
    
    // Add these fields to the update data
    updateData.invoiceId = invoiceId;
    updateData.transactionId = transactionId;
    updateData.paymentDate = new Date();
    updateData.paymentMethod = updateData.paymentMethod || "Bank Transfer";
  }
  
  // Find the document by its _id and update it
  const updatedBankInfo = await Payout.findByIdAndUpdate(payoutId, updateData, {
    new: true,
    runValidators: true,
  });
  
  if (updateData && updateData.status === "paid") {
    // console.log("Payout ID", payoutId);
    // console.log("updatedBankInfo.userId", updatedBankInfo.userId);
    const _userId = updatedBankInfo.userId;
    // Assuming you have the CP model and the amount to subtract from CP profile
    const cp = await CP.findOne({ userId: updatedBankInfo.userId });
    const amountToSubtract = updatedBankInfo.withdrawAmount;
    // Subtract the amount from the CP profile
    cp.currentBalance -= amountToSubtract;
    await cp.save();

    // Update transaction record to completed
    const transactionService = require("./transaction.service");
    const Transaction = require("../models/transaction.model");
    await Transaction.findOneAndUpdate(
      { payoutId: payoutId },
      {
        status: "completed",
        invoiceId: updatedBankInfo.invoiceId,
        transactionId: updatedBankInfo.transactionId,
        transactionDate: updatedBankInfo.paymentDate
      }
    );

    const notificationTitle = "Withdrawal Request";
    const notificationContent = "Your withdrawal request has been paid.";
    const notificationData = {
      type: "withdrawal",
      meetingId: payoutId.toString(),
      id: payoutId.toString(),
      invoiceId: updatedBankInfo.invoiceId,
      transactionId: updatedBankInfo.transactionId
    };

    sendNotification(
      _userId,
      notificationTitle,
      notificationContent,
      notificationData
    );

    // Temp code Hide
    // const customData = {
    //     type: "Payout",
    //     payoutId: payoutId.toString(),
    //     id: payoutId.toString(),
    //     cpIds: _userId,
    // }

    // await createNotificationData(_userId, notificationTitle, notificationContent, customData);

  }

  // Handle cancelled status
  if (updateData && updateData.status === "canceled") {
    const Transaction = require("../models/transaction.model");
    await Transaction.findOneAndUpdate(
      { payoutId: payoutId },
      { status: "cancelled" }
    );
  }

  if (!updatedBankInfo) {
    throw new Error("Payout Info not found.");
  }

  return updatedBankInfo;
};
//
const deletePayoutById = async (id) => {
  const payoutInfo = await Payout.findById(id);
  if (!payoutInfo) {
    throw new ApiError(httpStatus.NOT_FOUND, "Payout Information not found");
  }
  await payoutInfo.deleteOne();
  return payoutInfo;
};
module.exports = {
  createWithdrawRequest,
  getAllPayouts,
  updatePayoutData,
  deletePayoutById,
};
