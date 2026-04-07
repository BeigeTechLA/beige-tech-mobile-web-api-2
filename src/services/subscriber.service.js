const httpStatus = require("http-status");
const { Subscriber } = require("../models");
const ApiError = require("../utils/ApiError");
const emailService = require("./email.service");
const config = require("../config/config");

/**
 * Create a new subscriber
 * @param {Object} subscriberBody
 * @returns {Promise<Subscriber>}
 */
const createSubscriber = async (subscriberBody) => {
  try {
    const subscriber = await Subscriber.create(subscriberBody);
    
    // Send email to the subscriber
    await emailService.sendSubscriptionConfirmation(
      subscriberBody.email,
      {
        name: subscriberBody.full_name,
        businessName: subscriberBody.business_name
      }
    );
    
    // // Send email to admin
    await emailService.sendNewSubscriberNotification(
      config.email.adminEmail,
      {
        name: subscriberBody.full_name,
        businessName: subscriberBody.business_name,
        email: subscriberBody.email,
        phoneNumber: subscriberBody.phone_number,
        location: subscriberBody.location
      }
    );
    
    return subscriber;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Error creating subscriber');
  }
};

/**
 * Query for subscribers
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const querySubscribers = async (filter, options) => {
  try {
    const subscribers = await Subscriber.paginate(filter, options);
    return subscribers;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving subscribers');
  }
};

module.exports = {
  createSubscriber,
  querySubscribers,
};
