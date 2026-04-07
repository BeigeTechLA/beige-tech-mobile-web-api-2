const httpStatus = require('http-status');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const userService = require('./user.service');
const tokenService = require('./token.service');

/**
 * Find or create a user based on OAuth profile
 * @param {string} provider - The OAuth provider (google, facebook)
 * @param {Object} profile - The OAuth profile
 * @returns {Promise<User>}
 */
const findOrCreateUser = async (provider, profile) => {
  try {
    const providerId = `${provider}Id`;
    
    // Check if user already exists with this provider ID
    let user = await User.findOne({ [providerId]: profile.id });
    
    if (!user) {
      // Extract email from profile (different structure for different providers)
      let email;
      let name;
      
      if (provider === 'google') {
        email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        name = profile.displayName || 'User';
      } else if (provider === 'facebook') {
        email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@facebook.com`;
        name = profile.displayName || 'User';
      }
      
      if (email) {
        // Check if user exists with the same email
        user = await User.findOne({ email });
        
        if (user) {
          // Link provider account to existing user
          user[providerId] = profile.id;
          user.socialProvider = provider;
          user.isEmailVerified = true;
          await user.save();
        } else {
          // Create new user
          user = await userService.createUser({
            name,
            email,
            [providerId]: profile.id,
            socialProvider: provider,
            isEmailVerified: true,
            location: 'Not specified', // Default location
            password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8) // Random password
          });
        }
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Email not provided by OAuth provider');
      }
    }
    
    return user;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error processing OAuth authentication');
  }
};

/**
 * Process OAuth login and return tokens
 * @param {string} provider - The OAuth provider (google, facebook)
 * @param {Object} profile - The OAuth profile
 * @returns {Promise<Object>} - Auth tokens
 */
const oauthLogin = async (provider, profile) => {
  const user = await findOrCreateUser(provider, profile);
  const tokens = await tokenService.generateAuthTokens(user);
  return {
    user,
    tokens
  };
};

module.exports = {
  findOrCreateUser,
  oauthLogin
};
