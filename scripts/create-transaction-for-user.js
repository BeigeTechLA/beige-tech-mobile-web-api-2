require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Transaction = require('../src/models/transaction.model');
const User = require('../src/models/user.model');
const CP = require('../src/models/cp.model');

// User ID from JWT token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTUwYTYxNDcxYWJlNjJiYmM1OTY3YTMiLCJpYXQiOjE3NjY5MTI5NzgsImV4cCI6MTc2NjkxNDc3OCwidHlwZSI6ImFjY2VzcyJ9.SdBZ0snyQydmsLq7UWgBk_3wyCvT72Eci6affq3zSJk
const USER_ID = '6950a61471abe622bbc5967a3';

async function createTransactionForUser() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ Error: MONGODB_URL or MONGODB_URI environment variable is required');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Check if user exists
    const user = await User.findById(USER_ID);
    if (!user) {
      console.log('❌ User not found with ID:', USER_ID);
      process.exit(1);
    }
    console.log('✅ Found user:');
    console.log('   ID:', user._id);
    console.log('   Name:', user.name);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('');

    // Check if user has a CP profile
    let cp = await CP.findOne({ userId: USER_ID });
    if (!cp) {
      console.log('⚠️  No CP profile found. Creating one...');
      cp = await CP.create({
        userId: USER_ID,
        totalEarnings: 0,
        currentBalance: 0,
        geo_location: {
          type: 'Point',
          coordinates: [-73.935242, 40.730610] // Default NYC coordinates
        }
      });
      console.log('✅ Created CP profile\n');
    } else {
      console.log('✅ Found CP profile:');
      console.log('   Total Earnings:', cp.totalEarnings);
      console.log('   Current Balance:', cp.currentBalance);
      console.log('');
    }

    // Create a test transaction
    const transactionData = {
      type: 'earning',
      userId: USER_ID,
      amount: 500,
      status: 'completed',
      shootName: 'Test Transaction - Wedding Shoot',
      clientName: 'John Doe',
      transactionDate: new Date(),
      description: 'Test transaction created for user'
    };

    console.log('📝 Creating transaction...');
    const transaction = await Transaction.create(transactionData);
    console.log('✅ Transaction created successfully!\n');

    console.log('📋 Transaction Details:');
    console.log('   Transaction ID:', transaction._id);
    console.log('   Type:', transaction.type);
    console.log('   Amount: $' + transaction.amount);
    console.log('   Status:', transaction.status);
    console.log('   Shoot Name:', transaction.shootName);
    console.log('   Client Name:', transaction.clientName);
    console.log('   Transaction Date:', transaction.transactionDate);
    console.log('   Description:', transaction.description);
    console.log('');

    // Update CP balance
    if (transaction.type === 'earning' && transaction.status === 'completed') {
      cp.totalEarnings = (cp.totalEarnings || 0) + transaction.amount;
      cp.currentBalance = (cp.currentBalance || 0) + transaction.amount;
      await cp.save();
      console.log('✅ Updated CP profile:');
      console.log('   New Total Earnings: $' + cp.totalEarnings);
      console.log('   New Current Balance: $' + cp.currentBalance);
      console.log('');
    }

    // Show API endpoints to view the transaction
    console.log('🔗 API Endpoints to view this transaction:');
    console.log('');
    console.log('1. Get all transactions:');
    console.log('   GET {{base_url}}/api/v1/transactions/my-transactions');
    console.log('   Header: Authorization: Bearer <your_jwt_token>');
    console.log('');
    console.log('2. Get transaction summary:');
    console.log('   GET {{base_url}}/api/v1/transactions/summary');
    console.log('   Header: Authorization: Bearer <your_jwt_token>');
    console.log('');
    console.log('3. Get specific transaction:');
    console.log(`   GET {{base_url}}/api/v1/transactions/${transaction._id}`);
    console.log('   Header: Authorization: Bearer <your_jwt_token>');
    console.log('');

    console.log('✅ Done! Transaction is now available in the API.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the script
createTransactionForUser();




