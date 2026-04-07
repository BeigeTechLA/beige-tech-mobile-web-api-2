const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const config = require('./config');
const { tokenTypes } = require('./tokens');
const { User } = require('../models');
const oauthConfig = require('./oauth');
const userService = require('../services/user.service');

const jwtOptions = {
  secretOrKey: config.jwt.secret,
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};

const jwtVerify = async (payload, done) => {
  try {
    // Validate token type
    if (payload.type !== tokenTypes.ACCESS) {
      return done(null, false, { message: 'Invalid token type' });
    }
    
    // Validate token expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return done(null, false, { message: 'Token has expired' });
    }
    
    // Find user by ID
    const user = await User.findById(payload.sub);
    if (!user) {
      return done(null, false, { message: 'User not found' });
    }
    
    done(null, user);
  } catch (error) {
    done(error, false);
  }
};

const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify);

// Google OAuth Strategy (only if configured)
let googleStrategy = null;
if (oauthConfig.google.clientID && oauthConfig.google.clientSecret) {
  googleStrategy = new GoogleStrategy(
    oauthConfig.google,
    async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists with this Google ID
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        // Check if user exists with the same email
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // Link Google account to existing user
          user.googleId = profile.id;
          user.socialProvider = 'google';
          user.isEmailVerified = true;
          await user.save();
        } else {
          // Create new user
          user = await userService.createUser({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            socialProvider: 'google',
            isEmailVerified: true,
            location: 'Not specified', // Default location
            password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8) // Random password
          });
        }
      }
      
      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  });
}

// Facebook OAuth Strategy (only if configured)
let facebookStrategy = null;
if (oauthConfig.facebook.clientID && oauthConfig.facebook.clientSecret) {
  facebookStrategy = new FacebookStrategy(
    oauthConfig.facebook,
    async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists with this Facebook ID
      let user = await User.findOne({ facebookId: profile.id });
      
      if (!user) {
        // Check if user exists with the same email
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@facebook.com`;
        user = await User.findOne({ email });
        
        if (user) {
          // Link Facebook account to existing user
          user.facebookId = profile.id;
          user.socialProvider = 'facebook';
          user.isEmailVerified = true;
          await user.save();
        } else {
          // Create new user
          user = await userService.createUser({
            name: profile.displayName,
            email,
            facebookId: profile.id,
            socialProvider: 'facebook',
            isEmailVerified: true,
            location: 'Not specified', // Default location
            password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8) // Random password
          });
        }
      }
      
      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  });
}



module.exports = {
  jwtStrategy,
  googleStrategy,
  facebookStrategy
};
