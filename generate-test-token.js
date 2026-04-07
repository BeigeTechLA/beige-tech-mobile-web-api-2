/**
 * Generate a JWT token for testing (doesn't require database)
 * This creates a token for user ID: 6950a61471abe622bbc5967a3
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const jwt = require('jsonwebtoken');
const moment = require('moment');
const { tokenTypes } = require('./src/config/tokens');

const USER_ID = '6950a61471abe622bbc5967a3';

function generateTestToken() {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    console.error('❌ Error: JWT_SECRET not found in .env file');
    console.log('');
    console.log('Please add JWT_SECRET to your .env file');
    process.exit(1);
  }

  const accessTokenExpirationMinutes = parseInt(process.env.JWT_ACCESS_EXPIRATION_MINUTES || '30', 10);
  const accessTokenExpires = moment().add(accessTokenExpirationMinutes, 'minutes');

  const tokenPayload = {
    sub: USER_ID,
    iat: moment().unix(),
    exp: accessTokenExpires.unix(),
    type: tokenTypes.ACCESS,
  };

  const accessToken = jwt.sign(tokenPayload, jwtSecret);

  console.log('='.repeat(70));
  console.log('✅ JWT Token Generated Successfully!');
  console.log('='.repeat(70));
  console.log('');
  console.log('👤 User ID:', USER_ID);
  console.log('⏰ Expires:', accessTokenExpires.format('YYYY-MM-DD HH:mm:ss'));
  console.log('');
  console.log('🔑 YOUR JWT TOKEN (Copy this):');
  console.log('');
  console.log(accessToken);
  console.log('');
  console.log('='.repeat(70));
  console.log('');
  console.log('🔗 Test the API with:');
  console.log('');
  console.log('GET {{base_url}}/api/v1/transactions/my-transactions');
  console.log('Header: Authorization: Bearer ' + accessToken);
  console.log('');
  console.log('Or use curl:');
  console.log(`curl -X GET "http://localhost:5002/api/v1/transactions/my-transactions" \\`);
  console.log(`  -H "Authorization: Bearer ${accessToken}" \\`);
  console.log(`  -H "Content-Type: application/json"`);
  console.log('');
  console.log('='.repeat(70));
}

generateTestToken();

