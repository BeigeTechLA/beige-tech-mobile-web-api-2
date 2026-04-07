/**
 * Complete Portfolio API Testing Script
 * Tests all portfolio endpoints with proper error handling
 */

const mongoose = require('mongoose');
const axios = require('axios');
const config = require('../src/config/config');
const { User, CP, Portfolio } = require('../src/models');

const BASE_URL = 'http://localhost:5002/v1/portfolios';

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70) + '\n');
}

async function testAPI() {
  let testUser, testCP, testPortfolio;

  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    log('✅ Connected to MongoDB', 'green');

    // Setup test data
    logSection('📋 SETTING UP TEST DATA');

    // Find or create test user
    testUser = await User.findOne({ email: 'portfolio.test@example.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Portfolio Test User',
        email: 'portfolio.test@example.com',
        password: 'Password123!',
        role: 'cp',
        phoneNumber: '+1234567890',
        profile: {
          firstName: 'Portfolio',
          lastName: 'Tester',
        }
      });
      log('✅ Created test user', 'green');
    } else {
      log('✅ Found existing test user', 'green');
    }
    log(`   User ID: ${testUser._id}`, 'blue');

    // Find or create CP
    testCP = await CP.findOne({ userId: testUser._id });
    if (!testCP) {
      testCP = await CP.create({
        userId: testUser._id,
        city: 'New York',
        neighborhood: 'Manhattan',
        zip_code: '10011',
        content_type: ['photography', 'videography'],
        content_verticals: ['wedding', 'portrait', 'event'],
        photographyRate: '500',
        videographyRate: '700',
        combinedRate: '1000',
        tier: 'gold',
        review_status: 'accepted',
        geo_location: {
          type: 'Point',
          coordinates: [-73.99588, 40.73061]
        }
      });
      log('✅ Created test CP', 'green');
    } else {
      log('✅ Found existing test CP', 'green');
    }
    log(`   CP ID: ${testCP._id}`, 'blue');

    // Clean up existing test portfolios
    await Portfolio.deleteMany({ cpId: testCP._id });
    log('🗑️  Cleaned up existing test portfolios\n', 'yellow');

    // Test 1: Create Portfolio
    logSection('TEST 1: Create Portfolio');
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('portfolioName', 'Wedding Photography Portfolio');
      formData.append('specialities', JSON.stringify(['Wedding', 'Portrait', 'Event Photography']));
      formData.append('location', '47 W 13th St, New York, NY 10011, USA');
      formData.append('eventDate', '2025-12-29');
      formData.append('description', 'Professional wedding photography capturing your special moments');
      formData.append('cpId', testCP._id.toString());
      formData.append('userId', testUser._id.toString());

      const response = await axios.post(`${BASE_URL}/create`, formData, {
        headers: formData.getHeaders()
      });

      if (response.data.success) {
        testPortfolio = response.data.data;
        log('✅ Portfolio created successfully', 'green');
        log(`   Portfolio ID: ${testPortfolio._id}`, 'blue');
        log(`   Name: ${testPortfolio.portfolioName}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to create portfolio', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
      throw error;
    }

    // Test 2: Get Portfolio by ID
    logSection('TEST 2: Get Portfolio by ID');
    try {
      const response = await axios.get(`${BASE_URL}/${testPortfolio._id}`);
      if (response.data.success) {
        log('✅ Portfolio retrieved successfully', 'green');
        log(`   Name: ${response.data.data.portfolioName}`, 'blue');
        log(`   Location: ${response.data.data.location}`, 'blue');
        log(`   Views: ${response.data.data.viewsCount}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to get portfolio', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Test 3: Get Portfolios by CP ID
    logSection('TEST 3: Get All Portfolios for CP');
    try {
      const response = await axios.get(`${BASE_URL}/cp/${testCP._id}?limit=10&page=1`);
      if (response.data.success) {
        log('✅ Portfolios retrieved successfully', 'green');
        log(`   Total results: ${response.data.data.totalResults}`, 'blue');
        log(`   Page: ${response.data.data.page} of ${response.data.data.totalPages}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to get portfolios by CP', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Test 4: View Portfolio (increments view count)
    logSection('TEST 4: View Portfolio (Increment Views)');
    try {
      const response = await axios.get(`${BASE_URL}/${testPortfolio._id}/view`);
      if (response.data.success) {
        log('✅ Portfolio viewed successfully', 'green');
        log(`   Views: ${response.data.data.viewsCount}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to view portfolio', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Test 5: Update Portfolio
    logSection('TEST 5: Update Portfolio');
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('portfolioName', 'Updated Wedding Photography Portfolio');
      formData.append('description', 'Updated professional wedding photography with enhanced services');
      formData.append('userId', testUser._id.toString());

      const response = await axios.put(`${BASE_URL}/${testPortfolio._id}`, formData, {
        headers: formData.getHeaders()
      });

      if (response.data.success) {
        log('✅ Portfolio updated successfully', 'green');
        log(`   New Name: ${response.data.data.portfolioName}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to update portfolio', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Test 6: Increment Portfolio Views
    logSection('TEST 6: Increment Portfolio Views');
    try {
      const response = await axios.post(`${BASE_URL}/${testPortfolio._id}/increment-views`);
      if (response.data.success) {
        log('✅ View count incremented', 'green');
        log(`   Views: ${response.data.data.viewsCount}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to increment views', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Test 7: Get All Portfolios
    logSection('TEST 7: Get All Portfolios');
    try {
      const response = await axios.get(`${BASE_URL}/all?limit=10&page=1&sortBy=createdAt:desc`);
      if (response.data.success) {
        log('✅ All portfolios retrieved successfully', 'green');
        log(`   Total results: ${response.data.data.totalResults}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to get all portfolios', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
      // This might fail due to auth requirements
    }

    // Test 8: Delete Portfolio (Soft Delete)
    logSection('TEST 8: Delete Portfolio (Soft Delete)');
    try {
      const response = await axios.delete(`${BASE_URL}/${testPortfolio._id}`);
      if (response.data.success) {
        log('✅ Portfolio deleted successfully', 'green');
        log(`   Status: ${response.data.data.isActive ? 'Active' : 'Inactive'}`, 'blue');
      }
    } catch (error) {
      log('❌ Failed to delete portfolio', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Summary
    logSection('📊 TEST SUMMARY');
    log('✅ All tests completed', 'green');
    log('\nTest Data IDs:', 'cyan');
    log(`   User ID: ${testUser._id}`, 'blue');
    log(`   CP ID: ${testCP._id}`, 'blue');
    log(`   Portfolio ID: ${testPortfolio._id}`, 'blue');

  } catch (error) {
    log('\n❌ Test suite failed', 'red');
    log(`Error: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    log('\n✅ MongoDB connection closed', 'green');
    process.exit(0);
  }
}

// Run tests
console.log('Starting Portfolio API Tests...\n');
testAPI();

