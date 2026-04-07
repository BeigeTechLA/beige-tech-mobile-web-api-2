const httpStatus = require('http-status');
const { User, CP, BankInfo } = require('../models');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const Availability = require('../models/cpAvailability.model');

/**
 * Check if a CP's profile is complete
 * @param {string} cpId - The CP's user ID
 * @returns {Promise<Object>} - Profile completion status
 */
const getProfileCompletionStatus = async (cpId) => {
  // Validate that cpId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(cpId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid CP ID');
  }

  // Check if user exists and is a CP
  const user = await User.findById(cpId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Get CP profile data
  const cpProfile = await CP.findOne({ userId: cpId });
  if (!cpProfile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'CP profile not found');
  }

  // Check bank account information
  const bankInfo = await BankInfo.findOne({ userId: cpId });

  // Check availability
  const availability = await Availability.findOne({ cp_id: cpId });

  // Check if basic profile is complete (name, email, location)
  const isBasicProfileComplete = !!(
    user.name && 
    user.email && 
    user.location
  );

  // Check if portfolio/content is uploaded
  const isContentUploaded = !!(
    cpProfile.portfolioFileUploaded
  );

  // Check if bank account is connected
  const isBankAccountConnected = !!bankInfo;

  // Check if availability is set
  const isAvailabilitySet = !!availability;

  // Calculate overall completion status
  const completionStatus = {
    basicProfile: isBasicProfileComplete,
    contentUploaded: isContentUploaded,
    bankAccountConnected: isBankAccountConnected,
    availabilitySet: isAvailabilitySet,
    isProfileComplete: isBasicProfileComplete && isContentUploaded && isBankAccountConnected && isAvailabilitySet
  };
  
  return completionStatus;
};

/**
 * Get profile completion status for multiple CPs
 * @param {Array<string>} cpIds - Array of CP user IDs
 * @returns {Promise<Object>} - Profile completion status for each CP
 */
const getBulkProfileCompletionStatus = async (cpIds) => {
  // Validate that all cpIds are valid ObjectIds
  const validCpIds = cpIds.filter(id => mongoose.Types.ObjectId.isValid(id));
  
  if (validCpIds.length !== cpIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'One or more invalid CP IDs');
  }

  // Get completion status for each CP
  const results = {};
  
  await Promise.all(
    validCpIds.map(async (cpId) => {
      try {
        results[cpId] = await getProfileCompletionStatus(cpId);
      } catch (error) {
        results[cpId] = { error: error.message };
      }
    })
  );

  return results;
};

module.exports = {
  getProfileCompletionStatus,
  getBulkProfileCompletionStatus,
};
