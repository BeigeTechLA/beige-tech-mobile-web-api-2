/**
 * Create a test CP and Portfolio
 * This script helps you create valid test data for the portfolio API
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { User, CP, Portfolio } = require('../src/models');
const logger = require('../src/config/logger');

async function createCPAndPortfolio() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find or create a test user
    let testUser = await User.findOne({ email: 'photographer@test.com' });
    
    if (!testUser) {
      console.log('⚠️  No test user found. Creating one...');
      testUser = await User.create({
        name: 'Test Photographer',
        email: 'photographer@test.com',
        password: 'Password123!',
        role: 'cp',
        phoneNumber: '+1234567890',
        profile: {
          firstName: 'Test',
          lastName: 'Photographer',
        }
      });
      console.log('✅ Created test user');
    } else {
      console.log('✅ Found existing test user');
    }
    
    console.log(`   User ID: ${testUser._id}`);
    console.log(`   Name: ${testUser.name}`);
    console.log(`   Email: ${testUser.email}\n`);

    // Find or create CP profile
    let cp = await CP.findOne({ userId: testUser._id });
    
    if (!cp) {
      console.log('⚠️  No CP profile found. Creating one...');
      cp = await CP.create({
        userId: testUser._id,
        city: 'New York',
        neighborhood: 'Manhattan',
        zip_code: '10011',
        content_type: ['photography', 'videography'],
        content_verticals: ['wedding', 'portrait', 'event'],
        vst: ['Indian Wedding', 'Corporate Events'],
        shoot_availability: ['weekday', 'weekend'],
        rate: '500',
        photographyRate: '400',
        videographyRate: '600',
        combinedRate: '900',
        rateFlexibility: true,
        trust_score: 85,
        average_rating: 4.5,
        successful_beige_shoots: 25,
        equipment: ['DSLR', 'Drone', 'Lighting Kit'],
        portfolio: [],
        totalEarnings: 5000,
        currentBalance: 1500,
        tier: 'gold',
        review_status: 'accepted',
        geo_location: {
          type: 'Point',
          coordinates: [-73.99588, 40.73061] // NYC coordinates
        }
      });
      console.log('✅ Created CP profile');
    } else {
      console.log('✅ Found existing CP profile');
    }
    
    console.log(`   CP ID: ${cp._id}`);
    console.log(`   User ID: ${cp.userId}`);
    console.log(`   City: ${cp.city}`);
    console.log(`   Tier: ${cp.tier}`);
    console.log(`   Review Status: ${cp.review_status}\n`);

    // Check if portfolio already exists for this CP
    const existingPortfolio = await Portfolio.findOne({ cpId: cp._id });
    
    if (existingPortfolio) {
      console.log('ℹ️  Portfolio already exists for this CP');
      console.log(`   Portfolio ID: ${existingPortfolio._id}`);
      console.log(`   Name: ${existingPortfolio.portfolioName}\n`);
    } else {
      console.log('📝 No existing portfolio found\n');
    }

    // Generate curl command
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🚀 TEST CURL COMMAND');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const curlCommand = `curl --location 'http://localhost:5002/v1/portfolios/create' \\
--form 'portfolioName="Wedding Photography Portfolio"' \\
--form 'specialities="[\\"Wedding\\", \\"Portrait\\", \\"Event Photography\\"]"' \\
--form 'location="47 W 13th St, New York, NY 10011, USA"' \\
--form 'eventDate="2025-12-29"' \\
--form 'description="Professional wedding photography capturing your special moments with artistic flair and attention to detail."' \\
--form 'cpId="${cp._id}"' \\
--form 'userId="${testUser._id}"'`;

    console.log(curlCommand);
    console.log('\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 IMPORTANT IDs FOR TESTING');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`User ID:  ${testUser._id}`);
    console.log(`CP ID:    ${cp._id}`);
    if (existingPortfolio) {
      console.log(`Portfolio ID: ${existingPortfolio._id}`);
    }
    console.log('\n');

    // Generate test commands for all portfolio endpoints
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 OTHER TEST COMMANDS');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('# Get all portfolios for this CP:');
    console.log(`curl --location 'http://localhost:5002/v1/portfolios/cp/${cp._id}'\n`);
    
    if (existingPortfolio) {
      console.log('# Get specific portfolio:');
      console.log(`curl --location 'http://localhost:5002/v1/portfolios/${existingPortfolio._id}'\n`);
      
      console.log('# View portfolio (increments view count):');
      console.log(`curl --location 'http://localhost:5002/v1/portfolios/${existingPortfolio._id}/view'\n`);
      
      console.log('# Update portfolio:');
      console.log(`curl --location 'http://localhost:5002/v1/portfolios/${existingPortfolio._id}' \\
--request PUT \\
--form 'portfolioName="Updated Wedding Photography Portfolio"' \\
--form 'description="Updated description with more details"' \\
--form 'userId="${testUser._id}"'\n`);
    }
    
    console.log('# Get all portfolios (requires auth):');
    console.log(`curl --location 'http://localhost:5002/v1/portfolios/all?limit=10&page=1'\n`);

    // Close connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

createCPAndPortfolio();

