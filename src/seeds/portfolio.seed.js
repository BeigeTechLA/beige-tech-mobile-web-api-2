/**
 * Portfolio Seed Script
 * Creates test data for testing the Portfolio API
 *
 * Run with: node src/seeds/portfolio.seed.js
 */

const mongoose = require('mongoose');
const config = require('../config/config');
const { User, CP, Portfolio } = require('../models');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

// Sample test data
const seedData = {
  users: [
    {
      name: 'John Photographer',
      email: 'john.photographer@beige.com',
      password: 'Test@1234',
      role: 'cp',
      phoneNumber: '+1234567890',
      profile: 'https://randomuser.me/api/portraits/men/1.jpg',
    },
    {
      name: 'Sarah Videographer',
      email: 'sarah.videographer@beige.com',
      password: 'Test@1234',
      role: 'cp',
      phoneNumber: '+1234567891',
      profile: 'https://randomuser.me/api/portraits/women/1.jpg',
    },
    {
      name: 'Admin User',
      email: 'admin@beige.com',
      password: 'Test@1234',
      role: 'admin',
      phoneNumber: '+1234567892',
    }
  ],
  cps: [],
  portfolios: []
};

// Create seed data
const createSeedData = async () => {
  try {
    console.log('\n🌱 Starting seed process...\n');

    // Clear existing data (optional - comment out if you don't want to clear)
    console.log('🗑️  Clearing existing test data...');
    await Portfolio.deleteMany({
      portfolioName: { $regex: /Test Portfolio|Wedding Photography|Corporate Event/i }
    });
    // Don't delete CPs and Users to preserve existing data

    // Create Users
    console.log('👥 Creating test users...');
    const createdUsers = [];

    for (const userData of seedData.users) {
      // Check if user already exists
      let user = await User.findOne({ email: userData.email });

      if (!user) {
        user = await User.create(userData);
        console.log(`   ✓ Created user: ${user.name} (${user.email})`);
      } else {
        console.log(`   ℹ️  User already exists: ${user.name} (${user.email})`);
      }

      createdUsers.push(user);
    }

    // Create CPs for photographer and videographer users
    console.log('\n📸 Creating test Care Providers...');
    const createdCPs = [];

    const cpData = [
      {
        userId: createdUsers[0]._id,
        city: 'New York',
        neighborhood: 'Manhattan',
        zip_code: '10011',
        content_type: ['Photography', 'Videography'],
        content_verticals: ['Wedding', 'Portrait', 'Event'],
        vst: ['Indian Wedding', 'American Wedding', 'Corporate Events'],
        successful_beige_shoots: 45,
        rate: '500',
        photographyRate: '400',
        videographyRate: '600',
        combinedRate: '800',
        trust_score: 85,
        average_rating: 4.8,
        tier: 'gold',
        equipment: ['Canon EOS R5', 'Sony A7 III', 'DJI Ronin'],
        timezone: 'America/New_York',
        review_status: 'accepted',
        geo_location: {
          type: 'Point',
          coordinates: [-73.9969, 40.7356] // Manhattan coordinates
        }
      },
      {
        userId: createdUsers[1]._id,
        city: 'Los Angeles',
        neighborhood: 'Hollywood',
        zip_code: '90028',
        content_type: ['Videography', 'Photography'],
        content_verticals: ['Corporate', 'Commercial', 'Event'],
        vst: ['Product Launch', 'Conference', 'Trade Show'],
        successful_beige_shoots: 32,
        rate: '450',
        photographyRate: '350',
        videographyRate: '550',
        combinedRate: '750',
        trust_score: 78,
        average_rating: 4.6,
        tier: 'silver',
        equipment: ['Sony A7S III', 'Canon C70', 'Gimbal Stabilizer'],
        timezone: 'America/Los_Angeles',
        review_status: 'accepted',
        geo_location: {
          type: 'Point',
          coordinates: [-118.3287, 34.0928] // Hollywood coordinates
        }
      }
    ];

    for (const cp of cpData) {
      // Check if CP already exists for this user
      let existingCP = await CP.findOne({ userId: cp.userId });

      if (!existingCP) {
        const newCP = await CP.create(cp);
        console.log(`   ✓ Created CP for user: ${createdUsers.find(u => u._id.equals(cp.userId)).name}`);
        createdCPs.push(newCP);
      } else {
        console.log(`   ℹ️  CP already exists for user: ${createdUsers.find(u => u._id.equals(cp.userId)).name}`);
        createdCPs.push(existingCP);
      }
    }

    // Create Portfolios
    console.log('\n🎨 Creating test portfolios...');

    const portfolioData = [
      {
        portfolioName: 'Elegant Wedding Photography Collection',
        specialities: ['Wedding', 'Portrait', 'Event Photography'],
        location: '47 W 13th St, New York, NY 10011, USA',
        eventDate: new Date('2025-06-15'),
        description: 'Professional wedding photography capturing your special moments with artistic flair and attention to detail. Over 50 successful weddings documented with stunning visuals.',
        mediaFiles: [
          'https://images.unsplash.com/photo-1519741497674-611481863552',
          'https://images.unsplash.com/photo-1606800052052-a08af7148866',
          'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa'
        ],
        cpId: createdCPs[0]._id,
        createdBy: createdUsers[0]._id,
        isActive: true,
        viewsCount: 124
      },
      {
        portfolioName: 'Corporate Event Videography Showcase',
        specialities: ['Corporate Events', 'Videography', 'Conference Coverage'],
        location: 'Manhattan, New York, NY, USA',
        eventDate: new Date('2025-08-20'),
        description: 'High-quality corporate event videography including conferences, seminars, and product launches. Professional editing and same-day delivery available.',
        mediaFiles: [
          'https://images.unsplash.com/photo-1505373877841-8d25f7d46678',
          'https://images.unsplash.com/photo-1475721027785-f74eccf877e2'
        ],
        cpId: createdCPs[0]._id,
        createdBy: createdUsers[0]._id,
        isActive: true,
        viewsCount: 89
      },
      {
        portfolioName: 'Commercial Product Photography',
        specialities: ['Product Photography', 'Commercial', 'E-commerce'],
        location: 'Hollywood, Los Angeles, CA, USA',
        eventDate: new Date('2025-07-10'),
        description: 'Professional product photography for e-commerce, catalogs, and marketing materials. Studio and lifestyle shots available.',
        mediaFiles: [
          'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e'
        ],
        cpId: createdCPs[1]._id,
        createdBy: createdUsers[1]._id,
        isActive: true,
        viewsCount: 67
      },
      {
        portfolioName: 'Real Estate Photography Portfolio',
        specialities: ['Real Estate', 'Architectural Photography', 'Interior Design'],
        location: 'Upper East Side, New York, NY, USA',
        eventDate: new Date('2025-09-05'),
        description: 'Luxury real estate photography showcasing properties in their best light. HDR imaging, twilight shots, and virtual staging available.',
        mediaFiles: [
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9',
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c'
        ],
        cpId: createdCPs[0]._id,
        createdBy: createdUsers[0]._id,
        isActive: true,
        viewsCount: 201
      }
    ];

    const createdPortfolios = [];
    for (const portfolio of portfolioData) {
      const newPortfolio = await Portfolio.create(portfolio);
      console.log(`   ✓ Created portfolio: ${newPortfolio.portfolioName}`);
      createdPortfolios.push(newPortfolio);
    }

    // Display summary with IDs for testing
    console.log('\n\n🎉 Seed Data Created Successfully!\n');
    console.log('=' .repeat(80));
    console.log('📋 TEST DATA SUMMARY');
    console.log('=' .repeat(80));

    console.log('\n👥 USERS:');
    createdUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Role: ${user.role}`);
    });

    console.log('\n📸 CARE PROVIDERS:');
    createdCPs.forEach((cp, index) => {
      const user = createdUsers.find(u => u._id.equals(cp.userId));
      console.log(`${index + 1}. ${user.name}'s CP Profile`);
      console.log(`   CP ID: ${cp._id}`);
      console.log(`   User ID: ${cp.userId}`);
      console.log(`   City: ${cp.city}`);
      console.log(`   Tier: ${cp.tier}`);
      console.log(`   Rating: ${cp.average_rating}`);
    });

    console.log('\n🎨 PORTFOLIOS:');
    createdPortfolios.forEach((portfolio, index) => {
      console.log(`${index + 1}. ${portfolio.portfolioName}`);
      console.log(`   Portfolio ID: ${portfolio._id}`);
      console.log(`   CP ID: ${portfolio.cpId}`);
      console.log(`   Created By: ${portfolio.createdBy}`);
      console.log(`   Views: ${portfolio.viewsCount}`);
    });

    console.log('\n' + '=' .repeat(80));
    console.log('🧪 SAMPLE API REQUESTS');
    console.log('=' .repeat(80));

    const firstCP = createdCPs[0];
    const firstUser = createdUsers[0];

    console.log('\n1️⃣  CREATE PORTFOLIO:');
    console.log(`
curl --location 'http://localhost:5002/v1/portfolios/create' \\
--form 'portfolioName="Test Portfolio"' \\
--form 'specialities="[\\"Wedding\\", \\"Portrait\\"]"' \\
--form 'location="New York, NY, USA"' \\
--form 'eventDate="2025-12-29"' \\
--form 'description="Test portfolio description"' \\
--form 'cpId="${firstCP._id}"' \\
--form 'userId="${firstUser._id}"'
    `.trim());

    console.log('\n2️⃣  GET PORTFOLIO BY ID:');
    console.log(`
curl --location 'http://localhost:5002/v1/portfolios/${createdPortfolios[0]._id}'
    `.trim());

    console.log('\n3️⃣  GET PORTFOLIOS BY CP:');
    console.log(`
curl --location 'http://localhost:5002/v1/portfolios/cp/${firstCP._id}?page=1&limit=10'
    `.trim());

    console.log('\n4️⃣  UPDATE PORTFOLIO:');
    console.log(`
curl --location --request PUT 'http://localhost:5002/v1/portfolios/${createdPortfolios[0]._id}' \\
--form 'portfolioName="Updated Portfolio Name"' \\
--form 'description="Updated description"' \\
--form 'userId="${firstUser._id}"'
    `.trim());

    console.log('\n5️⃣  VIEW PORTFOLIO (PUBLIC):');
    console.log(`
curl --location 'http://localhost:5002/v1/portfolios/${createdPortfolios[0]._id}/view'
    `.trim());

    console.log('\n\n' + '=' .repeat(80));
    console.log('✅ You can now test the Portfolio API with the above IDs!');
    console.log('=' .repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error creating seed data:', error);
    throw error;
  }
};

// Run the seed script
const runSeed = async () => {
  try {
    await connectDB();
    await createSeedData();

    console.log('\n✨ Seed script completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Seed script failed:', error);
    process.exit(1);
  }
};

// Execute if run directly
if (require.main === module) {
  runSeed();
}

module.exports = { createSeedData };
