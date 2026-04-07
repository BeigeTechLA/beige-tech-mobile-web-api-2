/**
 * Test script to create transactions and verify API response
 * User ID: 6950a61471abe622bbc5967a3
 * JWT Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTUwYTYxNDcxYWJlNjJiYmM1OTY3YTMiLCJpYXQiOjE3NjY5MTI5NzgsImV4cCI6MTc2NjkxNDc3OCwidHlwZSI6ImFjY2VzcyJ9.SdBZ0snyQydmsLq7UWgBk_3wyCvT72Eci6affq3zSJk
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const Transaction = require('./src/models/transaction.model');
const User = require('./src/models/user.model');
const CP = require('./src/models/cp.model');

const USER_ID = '6950a61471abe622bbc5967a3';
let MONGODB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI;

// Try to load from config if not in env
if (!MONGODB_URI) {
  try {
    // Set NODE_ENV to avoid config validation error
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'development';
    }
    const config = require('./src/config/config');
    MONGODB_URI = config.mongoose.url;
  } catch (error) {
    // Config requires env vars, so we'll prompt user
  }
}

async function createTransactionsAndTest() {
  try {
    if (!MONGODB_URI) {
      console.error('❌ Error: MONGODB_URL or MONGODB_URI environment variable is required');
      console.log('');
      console.log('Please set it in your .env file:');
      console.log('   MONGODB_URL=mongodb://localhost:27017/beige');
      console.log('   OR');
      console.log('   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname');
      console.log('');
      console.log('Or run with:');
      console.log('   MONGODB_URL=your_connection_string node test-transaction-for-user.js');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if user exists
    const user = await User.findById(USER_ID);
    if (!user) {
      console.log('❌ User not found with ID:', USER_ID);
      process.exit(1);
    }
    console.log('✅ Found user:', user.name || user.email);
    console.log('   ID:', user._id);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('');

    // Check/create CP profile
    let cp = await CP.findOne({ userId: USER_ID });
    if (!cp) {
      console.log('⚠️  No CP profile found. Creating one...');
      cp = await CP.create({
        userId: USER_ID,
        totalEarnings: 0,
        currentBalance: 0,
        geo_location: {
          type: 'Point',
          coordinates: [-73.935242, 40.730610]
        }
      });
      console.log('✅ Created CP profile\n');
    } else {
      console.log('✅ Found CP profile');
      console.log('   Current Total Earnings:', cp.totalEarnings);
      console.log('   Current Balance:', cp.currentBalance);
      console.log('');
    }

    // Check existing transactions
    const existingCount = await Transaction.countDocuments({ userId: USER_ID });
    console.log(`📊 Existing transactions: ${existingCount}`);

    // Create test transactions
    const testTransactions = [
      {
        type: 'earning',
        userId: USER_ID,
        amount: 500,
        status: 'completed',
        shootName: 'Wedding Photoshoot - January 2025',
        clientName: 'Sarah Johnson',
        transactionDate: new Date('2025-01-15'),
        description: 'Earnings from wedding photoshoot'
      },
      {
        type: 'earning',
        userId: USER_ID,
        amount: 750,
        status: 'completed',
        shootName: 'Corporate Event Coverage',
        clientName: 'Tech Corp Inc',
        transactionDate: new Date('2025-01-20'),
        description: 'Earnings from corporate event'
      },
      {
        type: 'earning',
        userId: USER_ID,
        amount: 300,
        status: 'completed',
        shootName: 'Portrait Session',
        clientName: 'John Smith',
        transactionDate: new Date('2025-01-25'),
        description: 'Earnings from portrait session'
      },
      {
        type: 'withdrawal',
        userId: USER_ID,
        amount: 1000,
        status: 'completed',
        invoiceId: '#INV-2025-001',
        transactionId: 'TXN-12345678',
        paymentMethod: 'Bank Transfer',
        transactionDate: new Date('2025-01-10'),
        description: 'Withdrawal to bank account'
      },
      {
        type: 'earning',
        userId: USER_ID,
        amount: 1200,
        status: 'completed',
        shootName: 'Product Photography',
        clientName: 'Fashion Brand LLC',
        transactionDate: new Date(), // Today
        description: 'Earnings from product photography'
      }
    ];

    console.log('📝 Creating test transactions...');
    const createdTransactions = await Transaction.insertMany(testTransactions);
    console.log(`✅ Created ${createdTransactions.length} transactions\n`);

    // Calculate totals
    const totalEarnings = testTransactions
      .filter(t => t.type === 'earning' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalWithdrawals = testTransactions
      .filter(t => t.type === 'withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    // Update CP balance
    cp.totalEarnings = (cp.totalEarnings || 0) + totalEarnings;
    cp.currentBalance = (cp.currentBalance || 0) + totalEarnings - totalWithdrawals;
    await cp.save();

    console.log('📊 Transaction Summary:');
    console.log('   Total Earnings Added: $' + totalEarnings);
    console.log('   Total Withdrawals: $' + totalWithdrawals);
    console.log('   New Total Earnings: $' + cp.totalEarnings);
    console.log('   New Current Balance: $' + cp.currentBalance);
    console.log('');

    // Show created transactions
    console.log('📋 Created Transactions:');
    createdTransactions.forEach((tx, index) => {
      console.log(`   ${index + 1}. ${tx.type.toUpperCase()} - $${tx.amount} - ${tx.status}`);
      console.log(`      ${tx.shootName || tx.description}`);
      console.log(`      Date: ${tx.transactionDate.toLocaleDateString()}`);
      console.log('');
    });

    console.log('✅ All transactions created successfully!');
    console.log('');
    console.log('🔗 Test the API with:');
    console.log('');
    console.log('GET {{base_url}}/api/v1/transactions/my-transactions');
    console.log('Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTUwYTYxNDcxYWJlNjJiYmM1OTY3YTMiLCJpYXQiOjE3NjY5MTI5NzgsImV4cCI6MTc2NjkxNDc3OCwidHlwZSI6ImFjY2VzcyJ9.SdBZ0snyQydmsLq7UWgBk_3wyCvT72Eci6affq3zSJk');
    console.log('');
    console.log('GET {{base_url}}/api/v1/transactions/summary');
    console.log('Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTUwYTYxNDcxYWJlNjJiYmM1OTY3YTMiLCJpYXQiOjE3NjY5MTI5NzgsImV4cCI6MTc2NjkxNDc3OCwidHlwZSI6ImFjY2VzcyJ9.SdBZ0snyQydmsLq7UWgBk_3wyCvT72Eci6affq3zSJk');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the script
createTransactionsAndTest();

