const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { profileCompletionService } = require('../services');

/**
 * Get profile completion status for a single CP
 */
const getProfileCompletionStatus = catchAsync(async (req, res) => {
  const cpId = req.params.cpId;
  const result = await profileCompletionService.getProfileCompletionStatus(cpId);
  res.status(httpStatus.OK).send(result);
});

/**
 * Get profile completion status for multiple CPs
 */
const getBulkProfileCompletionStatus = catchAsync(async (req, res) => {
  const { cpIds } = req.body;
  
  if (!cpIds || !Array.isArray(cpIds) || cpIds.length === 0) {
    return res.status(httpStatus.BAD_REQUEST).send({ 
      message: 'Please provide an array of CP IDs' 
    });
  }
  
  const results = await profileCompletionService.getBulkProfileCompletionStatus(cpIds);
  res.status(httpStatus.OK).send(results);
});

module.exports = {
  getProfileCompletionStatus,
  getBulkProfileCompletionStatus,
};
