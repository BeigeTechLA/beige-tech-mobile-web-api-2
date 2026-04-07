/**
 * Test script to create a transaction and view it via API
 * 
 * Usage:
 * 1. Make sure your API server is running
 * 2. Set BASE_URL environment variable (default: http://localhost:3000)
 * 3. Update the JWT_TOKEN with a valid token
 * 4. Run: node scripts/test-transaction-api.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTUwYTYxNDcxYWJlNjJiYmM1OTY3YTMiLCJpYXQiOjE3NjY5MTI5NzgsImV4cCI6MTc2NjkxNDc3OCwidHlwZSI6ImFjY2VzcyJ9.SdBZ0snyQydmsLq7UWgBk_3wyCvT72Eci6affq3zSJk';

async function testTransactionAPI() {
  try {
    console.log('🔗 Testing Transaction API...\n');
    console.log('Base URL:', BASE_URL);
    console.log('');

    // 1. Get transactions
    console.log('1️⃣  Fetching transactions...');
    const transactionsResponse = await fetch(`${BASE_URL}/api/v1/transactions/my-transactions`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!transactionsResponse.ok) {
      const errorText = await transactionsResponse.text();
      console.error('❌ Error fetching transactions:', transactionsResponse.status, errorText);
      return;
    }

    const transactionsData = await transactionsResponse.json();
    console.log('✅ Transactions fetched successfully!');
    console.log('   Total Results:', transactionsData.totalResults || transactionsData.results?.length || 0);
    console.log('   Page:', transactionsData.page || 1);
    console.log('');

    if (transactionsData.results && transactionsData.results.length > 0) {
      console.log('📋 Recent Transactions:');
      transactionsData.results.slice(0, 5).forEach((tx, index) => {
        console.log(`   ${index + 1}. ${tx.type.toUpperCase()} - $${tx.amount} - ${tx.status}`);
        console.log(`      Shoot: ${tx.shootName || 'N/A'}`);
        console.log(`      Date: ${new Date(tx.transactionDate).toLocaleDateString()}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No transactions found');
      console.log('');
    }

    // 2. Get summary
    console.log('2️⃣  Fetching transaction summary...');
    const summaryResponse = await fetch(`${BASE_URL}/api/v1/transactions/summary`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!summaryResponse.ok) {
      const errorText = await summaryResponse.text();
      console.error('❌ Error fetching summary:', summaryResponse.status, errorText);
      return;
    }

    const summaryData = await summaryResponse.json();
    console.log('✅ Summary fetched successfully!');
    console.log('');
    console.log('📊 Transaction Summary:');
    console.log('   Total Transactions: $' + (summaryData.totalTransactions || 0));
    console.log('   Earning Last Month: $' + (summaryData.earningLastMonth || 0));
    console.log('   Available Balance: $' + (summaryData.availableBalance || 0));
    console.log('');

    console.log('✅ All API tests completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

// Run the test
testTransactionAPI();
