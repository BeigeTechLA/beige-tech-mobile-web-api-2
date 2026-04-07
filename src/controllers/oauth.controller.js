const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { tokenService, userService } = require('../services');
const passport = require('passport');

/**
 * Handle OAuth authentication callback
 * @param {string} provider - The OAuth provider (google, facebook)
 * @returns {Function} - Express middleware function
 */
const oauthCallback = (provider) => 
  catchAsync(async (req, res) => {
    // Passport authentication is handled in the route middleware
    // At this point, user is already authenticated and available in req.user
    const user = req.user;
    const tokens = await tokenService.generateAuthTokens(user);
    
    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Get the redirect parameter from the request if it exists
    const redirectParam = req.query.redirect || '/dashboard';
    
    // Create a URL with tokens and user data as query parameters
    // The frontend will extract these tokens and user data in the social-callback page
    const userData = encodeURIComponent(JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    }));
    
    const redirectUrl = `${frontendUrl}/Auth/social-callback?access_token=${tokens.access.token}&refresh_token=${tokens.refresh.token}&user_id=${user.id}&user_data=${userData}&redirect=${encodeURIComponent(redirectParam)}`;
    
    res.redirect(redirectUrl);
  });

/**
 * Handle mobile app OAuth callback
 * This endpoint is specifically for mobile apps that use deep linking
 * @param {string} provider - The OAuth provider (google, facebook)
 */
const mobileOauthCallback = (provider) =>
  catchAsync(async (req, res) => {
    const user = req.user;
    const tokens = await tokenService.generateAuthTokens(user);
    
    // For mobile apps, we can use a custom URL scheme
    // Example: myapp://auth/callback?access_token=xxx&refresh_token=yyy
    const mobileScheme = process.env.MOBILE_URL_SCHEME || 'myapp';
    
    // Include user data in the redirect URL
    const userData = encodeURIComponent(JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    }));
    
    const redirectUrl = `${mobileScheme}://Auth/callback?access_token=${tokens.access.token}&refresh_token=${tokens.refresh.token}&user_id=${user.id}&user_data=${userData}`;
    
    res.redirect(redirectUrl);
  });

/**
 * Link social account to existing user
 */
const linkSocialAccount = (provider) =>
  catchAsync(async (req, res) => {
    // This requires the user to be already authenticated
    const user = req.user;
    const socialId = req.body.socialId;
    const socialEmail = req.body.email;
    
    if (!socialId) {
      return res.status(httpStatus.BAD_REQUEST).send({ 
        code: httpStatus.BAD_REQUEST,
        message: 'Social ID is required'
      });
    }
    
    // Update user with social provider ID
    const updateData = {
      [`${provider}Id`]: socialId,
      socialProvider: provider
    };
    
    // If email from social provider is verified, mark user's email as verified
    if (socialEmail) {
      updateData.isEmailVerified = true;
    }
    
    await userService.updateUserById(user.id, updateData);
    
    res.status(httpStatus.OK).send({
      success: true,
      message: `${provider} account linked successfully`
    });
  });

module.exports = {
  oauthCallback,
  mobileOauthCallback,
  linkSocialAccount
};
