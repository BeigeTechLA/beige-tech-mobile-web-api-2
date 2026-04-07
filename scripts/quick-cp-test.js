/**
 * Quick script to find existing CPs and generate test curl commands
 * Run with: node scripts/quick-cp-test.js
 */

const mongoose = require('mongoose');

// Get MongoDB URL from command line or use default
const MONGODB_URL = process.argv[2] || 'mongodb://localhost:27017/beige';

const cpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  city: String,
  review_status: String,
  geo_location: {
    type: { type: String },
    coordinates: [Number]
  }
}, { collection: 'cps' });

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
}, { collection: 'users' });

const CP = mongoose.model('CP', cpSchema);
const User = mongoose.model('User', userSchema);

async function findCPsAndGenerateCommands() {
  try {
    console.log('\n🔌 Connecting to MongoDB...');
    console.log(`   URL: ${MONGODB_URL}\n`);
    
    await mongoose.connect(MONGODB_URL, {
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ Connected to MongoDB\n');
    console.log('═'.repeat(70));
    console.log('🔍 SEARCHING FOR EXISTING CPs');
    console.log('═'.repeat(70) + '\n');

    // Find CPs with populated user data
    const cps = await CP.find()
      .populate('userId')
      .limit(5);

    if (cps.length === 0) {
      console.log('❌ No Care Providers found in the database!\n');
      console.log('You need to create a CP first. Run this script to create one:');
      console.log('   node scripts/create-test-user-and-cp.js\n');
      process.exit(1);
    }

    console.log(`✅ Found ${cps.length} Care Provider(s)\n`);

    cps.forEach((cp, index) => {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`CP #${index + 1}`);
      console.log('─'.repeat(70));
      console.log(`CP ID:          ${cp._id}`);
      console.log(`User ID:        ${cp.userId?._id || 'N/A'}`);
      console.log(`User Name:      ${cp.userId?.name || 'N/A'}`);
      console.log(`User Email:     ${cp.userId?.email || 'N/A'}`);
      console.log(`City:           ${cp.city || 'N/A'}`);
      console.log(`Review Status:  ${cp.review_status || 'N/A'}`);
      
      if (cp.userId && cp.userId._id) {
        console.log('\n📋 CURL COMMAND:');
        console.log('─'.repeat(70));
        const curlCommand = `curl --location 'http://localhost:5002/v1/portfolios/create' \\
--form 'portfolioName="Wedding Photography Portfolio"' \\
--form 'specialities="[\\"Wedding\\", \\"Portrait\\", \\"Event Photography\\"]"' \\
--form 'location="47 W 13th St, New York, NY 10011, USA"' \\
--form 'eventDate="2025-12-29"' \\
--form 'description="Professional wedding photography capturing your special moments"' \\
--form 'cpId="${cp._id}"' \\
--form 'userId="${cp.userId._id}"'`;
        console.log(curlCommand);
      } else {
        console.log('\n⚠️  This CP has no valid user - cannot create portfolio');
      }
    });

    console.log('\n\n' + '═'.repeat(70));
    console.log('✨ RECOMMENDATION');
    console.log('═'.repeat(70));
    console.log('\nUse CP #1 for testing (copy the curl command above)');
    console.log('\n');

    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.name === 'MongoServerSelectionError') {
      console.error('\n💡 TIP: Make sure MongoDB is running and the URL is correct');
      console.error('   Current URL:', MONGODB_URL);
      console.error('   \n   To use a different URL, run:');
      console.error('   node scripts/quick-cp-test.js "mongodb://your-url-here"');
    }
    process.exit(1);
  }
}

findCPsAndGenerateCommands();

