const mongoose = require('mongoose');
const config = require('../src/config/config');
const Transaction = require('../src/models/transaction.model');
const User = require('../src/models/user.model');
const Order = require('../src/models/order.model');
const CP = require('../src/models/cp.model');

// Test user ID from the JWT token
const TEST_USER_ID = '66c48430401d94ee1d09df73';

async function createTestTransactions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Check if user exists
    const user = await User.findById(TEST_USER_ID);
    if (!user) {
      console.log('❌ User not found with ID:', TEST_USER_ID);
      process.exit(1);
    }
    console.log('✅ Found user:', user.name, '(', user.email, ')');

    // Check if user has a CP profile
    let cp = await CP.findOne({ userId: TEST_USER_ID });
    if (!cp) {
      console.log('⚠️  No CP profile found. Creating one...');
      cp = await CP.create({
        userId: TEST_USER_ID,
        totalEarnings: 0,
        currentBalance: 0,
        geo_location: {
          type: 'Point',
          coordinates: [-73.935242, 40.730610] // Default NYC coordinates
        }
      });
      console.log('✅ Created CP profile');
    } else {
      console.log('✅ Found CP profile');
      console.log('   Total Earnings:', cp.totalEarnings);
      console.log('   Current Balance:', cp.currentBalance);
    }

    // Delete existing test transactions for this user
    const deleteResult = await Transaction.deleteMany({ userId: TEST_USER_ID });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing transactions`);

    // Create test client user for transactions
    let testClient = await User.findOne({ email: 'test.client@example.com' });
    if (!testClient) {
      testClient = await User.create({
        name: 'Mark Smith',
        email: 'test.client@example.com',
        password: 'Password123',
        role: 'user',
        isEmailVerified: true
      });
      console.log('✅ Created test client user');
    }

    // Create test order for earning transactions
    let testOrder = await Order.findOne({ order_name: 'Nasir wedding' });
    if (!testOrder) {
      testOrder = await Order.create({
        client_id: testClient._id,
        cp_ids: [{
          id: TEST_USER_ID,
          decision: 'accepted',
          assignedAt: new Date()
        }],
        order_name: 'Nasir wedding',
        shoot_cost: 1000,
        order_status: 'completed',
        payment: {
          payment_type: 'full',
          payment_status: 'paid',
          amount_paid: 1000,
          amount_remaining: 0
        },
        shoot_datetimes: [{
          start_date_time: new Date('2024-05-06T10:00:00'),
          end_date_time: new Date('2024-05-06T16:00:00'),
          duration: 6,
          date_status: 'confirmed'
        }],
        geo_location: {
          type: 'Point',
          coordinates: [-73.935242, 40.730610]
        }
      });
      console.log('✅ Created test order');
    }

    // Create multiple test transactions
    const testTransactions = [
      // Earnings
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'John da',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'JohnDoe',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'John Doe',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'John da',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'John Doe34345245',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 500,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'imteaj sajid',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'John Doe',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'John Doe',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 500,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'imteaj sajid',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 250,
        status: 'completed',
        orderId: testOrder._id,
        shootName: 'Nasir wedding',
        clientId: testClient._id,
        clientName: 'John Doe34hh345245',
        transactionDate: new Date('2024-05-06'),
        description: 'Earnings from Nasir wedding'
      },

      // Recent high-value earnings
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 2250,
        status: 'completed',
        shootName: 'INV-6889b133',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-30'),
        description: 'Earnings from corporate event'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 14000,
        status: 'completed',
        shootName: 'INV-6888705b',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-29'),
        description: 'Earnings from wedding shoot'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 26000,
        status: 'completed',
        shootName: 'INV-68886f6b',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-29'),
        description: 'Earnings from premium package'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 8000,
        status: 'completed',
        shootName: 'INV-688863a5',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-29'),
        description: 'Earnings from portrait session'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 0,
        status: 'completed',
        shootName: 'INV-68821868',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-24'),
        description: 'Test order'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 0,
        status: 'completed',
        shootName: 'INV-68b47d28',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-08-31'),
        description: 'Recent shoot'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 0,
        status: 'completed',
        shootName: 'INV-68b47d02',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-08-31'),
        description: 'Recent shoot'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 0,
        status: 'completed',
        shootName: 'INV-688a14be',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-30'),
        description: 'Photo session'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 0,
        status: 'completed',
        shootName: 'INV-6889f449',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-30'),
        description: 'Video project'
      },
      {
        type: 'earning',
        userId: TEST_USER_ID,
        amount: 0,
        status: 'completed',
        shootName: 'INV-6889e85b',
        clientName: 'Mark Smith',
        transactionDate: new Date('2025-07-30'),
        description: 'Commercial shoot'
      },

      // Withdrawals
      {
        type: 'withdrawal',
        userId: TEST_USER_ID,
        amount: 5000,
        status: 'completed',
        invoiceId: '#INV-2025-001',
        transactionId: 'TXN-12345678',
        paymentMethod: 'Bank Transfer',
        transactionDate: new Date('2025-07-15'),
        description: 'Withdrawal to bank account'
      },
      {
        type: 'withdrawal',
        userId: TEST_USER_ID,
        amount: 3000,
        status: 'completed',
        invoiceId: '#INV-2025-002',
        transactionId: 'TXN-87654321',
        paymentMethod: 'Bank Transfer',
        transactionDate: new Date('2025-06-01'),
        description: 'Withdrawal to bank account'
      },
      {
        type: 'withdrawal',
        userId: TEST_USER_ID,
        amount: 2000,
        status: 'pending',
        paymentMethod: 'Bank Transfer',
        transactionDate: new Date(),
        description: 'Pending withdrawal request'
      }
    ];

    // Insert all transactions
    const createdTransactions = await Transaction.insertMany(testTransactions);
    console.log(`✅ Created ${createdTransactions.length} test transactions`);

    // Update CP balance to reflect transactions
    const totalEarnings = testTransactions
      .filter(t => t.type === 'earning' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalWithdrawals = testTransactions
      .filter(t => t.type === 'withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    cp.totalEarnings = totalEarnings;
    cp.currentBalance = totalEarnings - totalWithdrawals;
    await cp.save();

    console.log('\n📊 Transaction Summary:');
    console.log(`   Total Earnings: $${totalEarnings}`);
    console.log(`   Total Withdrawals: $${totalWithdrawals}`);
    console.log(`   Current Balance: $${cp.currentBalance}`);

    // Count transactions by type
    const earningCount = testTransactions.filter(t => t.type === 'earning').length;
    const withdrawalCount = testTransactions.filter(t => t.type === 'withdrawal').length;

    console.log('\n📈 Breakdown:');
    console.log(`   Earnings: ${earningCount} transactions`);
    console.log(`   Withdrawals: ${withdrawalCount} transactions`);

    console.log('\n✅ Test data created successfully!');
    console.log('\n🔑 User ID:', TEST_USER_ID);
    console.log('📧 User Email:', user.email);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the script
createTestTransactions();
