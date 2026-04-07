/**
 * Direct API test script
 * Tests the transaction API and shows what's returned
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5002';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTUwYTYxNDcxYWJlNjJiYmM1OTY3YTMiLCJpYXQiOjE3NjY5MTI5NzgsImV4cCI6MTc2NjkxNDc3OCwidHlwZSI6ImFjY2VzcyJ9.SdBZ0snyQydmsLq7UWgBk_3wyCvT72Eci6affq3zSJk';

async function testTransactionAPI() {
  console.log('🔗 Testing Transaction API...\n');
  console.log('Base URL:', BASE_URL);
  console.log('User ID: 6950a61471abe622bbc5967a3');
  console.log('');

  try {
    // Test 1: Get transactions
    console.log('1️⃣  Testing GET /api/v1/transactions/my-transactions');
    console.log('   URL:', `${BASE_URL}/api/v1/transactions/my-transactions`);
    
    const transactionsResponse = await fetch(`${BASE_URL}/api/v1/transactions/my-transactions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('   Status:', transactionsResponse.status, transactionsResponse.statusText);

    if (!transactionsResponse.ok) {
      const errorText = await transactionsResponse.text();
      console.error('   ❌ Error:', errorText);
      console.log('');
      console.log('   Possible issues:');
      console.log('   - API server is not running');
      console.log('   - Wrong base URL (try http://localhost:3000 or http://localhost:5002)');
      console.log('   - Token expired or invalid');
      return;
    }

    const transactionsData = await transactionsResponse.json();
    console.log('   ✅ Success!\n');
    
    console.log('📋 Response Data:');
    console.log('   Total Results:', transactionsData.totalResults || 0);
    console.log('   Page:', transactionsData.page || 1);
    console.log('   Limit:', transactionsData.limit || 10);
    console.log('   Total Pages:', transactionsData.totalPages || 0);
    console.log('');

    if (transactionsData.results && transactionsData.results.length > 0) {
      console.log(`   Found ${transactionsData.results.length} transaction(s):\n`);
      transactionsData.results.forEach((tx, index) => {
        console.log(`   ${index + 1}. ${tx.type.toUpperCase()} - $${tx.amount} - ${tx.status}`);
        console.log(`      Shoot: ${tx.shootName || 'N/A'}`);
        console.log(`      Client: ${tx.clientName || 'N/A'}`);
        console.log(`      Date: ${new Date(tx.transactionDate).toLocaleDateString()}`);
        console.log(`      Description: ${tx.description || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('   ⚠️  No transactions found!');
      console.log('   💡 Run this command to create test transactions:');
      console.log('      node test-transaction-for-user.js');
      console.log('');
    }

    // Test 2: Get summary
    console.log('2️⃣  Testing GET /api/v1/transactions/summary');
    console.log('   URL:', `${BASE_URL}/api/v1/transactions/summary`);
    
    const summaryResponse = await fetch(`${BASE_URL}/api/v1/transactions/summary`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('   Status:', summaryResponse.status, summaryResponse.statusText);

    if (!summaryResponse.ok) {
      const errorText = await summaryResponse.text();
      console.error('   ❌ Error:', errorText);
    } else {
      const summaryData = await summaryResponse.json();
      console.log('   ✅ Success!\n');
      console.log('📊 Summary Data:');
      console.log('   Total Transactions: $' + (summaryData.totalTransactions || 0));
      console.log('   Earning Last Month: $' + (summaryData.earningLastMonth || 0));
      console.log('   Available Balance: $' + (summaryData.availableBalance || 0));
    }

    console.log('\n✅ API test completed!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('');
    console.log('Possible issues:');
    console.log('1. API server is not running - start it with: npm start');
    console.log('2. Wrong base URL - try setting BASE_URL environment variable');
    console.log('3. Network connectivity issue');
    console.log('');
    console.log('To set a different base URL:');
    console.log('  BASE_URL=http://localhost:3000 node test-api-direct.js');
  }
}

// Run the test
testTransactionAPI();

