/**
 * Create a test user and CP without requiring full environment
 * Run with: node scripts/create-test-user-and-cp.js [mongodb-url]
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Get MongoDB URL from command line or use default
const MONGODB_URL = process.argv[2] || 'mongodb://localhost:27017/beige';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 8 },
  role: { type: String, enum: ['user', 'cp', 'admin', 'client'], default: 'user' },
  phoneNumber: String,
  isEmailVerified: { type: Boolean, default: false },
  profile: {
    firstName: String,
    lastName: String,
  }
}, { collection: 'users', timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 8);
  next();
});

const cpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  city: String,
  neighborhood: String,
  zip_code: String,
  content_type: [String],
  content_verticals: [String],
  vst: [String],
  shoot_availability: [String],
  rate: { type: String, default: '0' },
  photographyRate: { type: String, default: '0' },
  videographyRate: { type: String, default: '0' },
  combinedRate: { type: String, default: '0' },
  rateFlexibility: { type: Boolean, default: true },
  trust_score: { type: Number, default: 0 },
  average_rating: { type: Number, default: 0 },
  successful_beige_shoots: { type: Number, default: 0 },
  equipment: [String],
  portfolio: [String],
  totalEarnings: { type: Number, default: 0 },
  currentBalance: { type: Number, default: 0 },
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    default: 'bronze'
  },
  review_status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  geo_location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  }
}, { collection: 'cps', timestamps: true });

const User = mongoose.model('User', userSchema);
const CP = mongoose.model('CP', cpSchema);

async function createTestUserAndCP() {
  try {
    console.log('\n🔌 Connecting to MongoDB...');
    console.log(`   URL: ${MONGODB_URL}\n`);
    
    await mongoose.connect(MONGODB_URL, {
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ Connected to MongoDB\n');
    console.log('═'.repeat(70));
    console.log('👤 CREATING TEST USER AND CP');
    console.log('═'.repeat(70) + '\n');

    // Create unique email with timestamp
    const timestamp = Date.now();
    const testEmail = `photographer${timestamp}@test.com`;

    // Create test user
    console.log('Creating test user...');
    const testUser = await User.create({
      name: 'Test Photographer',
      email: testEmail,
      password: 'Password123!',
      role: 'cp',
      phoneNumber: '+1234567890',
      isEmailVerified: true,
      profile: {
        firstName: 'Test',
        lastName: 'Photographer'
      }
    });
    console.log('✅ Test user created');
    console.log(`   User ID: ${testUser._id}`);
    console.log(`   Email: ${testUser.email}\n`);

    // Create CP profile
    console.log('Creating CP profile...');
    const testCP = await CP.create({
      userId: testUser._id,
      city: 'New York',
      neighborhood: 'Manhattan',
      zip_code: '10011',
      content_type: ['photography', 'videography'],
      content_verticals: ['wedding', 'portrait', 'event', 'corporate'],
      vst: ['Indian Wedding', 'Corporate Events', 'Birthday Parties'],
      shoot_availability: ['weekday', 'weekend', 'evening'],
      rate: '500',
      photographyRate: '400',
      videographyRate: '600',
      combinedRate: '900',
      rateFlexibility: true,
      trust_score: 85,
      average_rating: 4.5,
      successful_beige_shoots: 25,
      equipment: ['DSLR Camera', 'Mirrorless Camera', 'Drone', 'Lighting Kit', 'Gimbal'],
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
    console.log('✅ CP profile created');
    console.log(`   CP ID: ${testCP._id}\n`);

    console.log('═'.repeat(70));
    console.log('🎉 SUCCESS - TEST DATA CREATED');
    console.log('═'.repeat(70) + '\n');

    console.log('📋 IMPORTANT IDs:');
    console.log('─'.repeat(70));
    console.log(`User ID:  ${testUser._id}`);
    console.log(`CP ID:    ${testCP._id}`);
    console.log(`Email:    ${testUser.email}`);
    console.log(`Password: Password123!`);
    console.log('\n');

    console.log('═'.repeat(70));
    console.log('🚀 TEST CURL COMMAND');
    console.log('═'.repeat(70) + '\n');

    const curlCommand = `curl --location 'http://localhost:5002/v1/portfolios/create' \\
--form 'portfolioName="Wedding Photography Portfolio"' \\
--form 'specialities="[\\"Wedding\\", \\"Portrait\\", \\"Event Photography\\"]"' \\
--form 'location="47 W 13th St, New York, NY 10011, USA"' \\
--form 'eventDate="2025-12-29"' \\
--form 'description="Professional wedding photography capturing your special moments with artistic flair and attention to detail."' \\
--form 'cpId="${testCP._id}"' \\
--form 'userId="${testUser._id}"'`;

    console.log(curlCommand);
    console.log('\n');

    console.log('═'.repeat(70));
    console.log('📝 NEXT STEPS');
    console.log('═'.repeat(70) + '\n');
    console.log('1. Make sure your API server is running on port 5002');
    console.log('2. Copy and run the curl command above');
    console.log('3. You should see a successful portfolio creation response\n');
    console.log('To test other endpoints, use these IDs with the API documentation\n');

    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 11000) {
      console.error('\n💡 TIP: A user with this email already exists.');
      console.error('   The script creates unique emails each time, but there might be an issue.');
    }
    if (error.name === 'MongoServerSelectionError') {
      console.error('\n💡 TIP: Make sure MongoDB is running and the URL is correct');
      console.error('   Current URL:', MONGODB_URL);
      console.error('\n   To use a different URL, run:');
      console.error('   node scripts/create-test-user-and-cp.js "mongodb://your-url-here"');
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

createTestUserAndCP();

