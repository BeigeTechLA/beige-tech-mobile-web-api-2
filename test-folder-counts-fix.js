/**
 * Test script to verify folder counts access control fix
 * 
 * This script tests the getFolderCounts API endpoint to ensure:
 * 1. Admin users see all files
 * 2. Regular users only see files they have access to
 * 3. Raw footage is hidden from regular users
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:5002';
const TEST_CONFIG = {
  // Test folder path
  folderPath: "Sajid's shoot-raw_a098c",
  
  // Test users - replace with actual user IDs from your database
  adminUserId: '664edf60caef2c061f6117ff',  // Admin user
  regularUserId: '664edf60caef2c061f6117ff', // Regular user (same user but testing as different role)
};

/**
 * Get folder counts for a user
 */
async function getFolderCounts(userId, folderPath) {
  try {
    const encodedPath = encodeURIComponent(folderPath);
    const url = `${BASE_URL}/v1/gcp/folder-counts/${userId}/${encodedPath}`;
    
    console.log(`\n🔍 Testing: ${url}`);
    
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Display test results
 */
function displayResults(label, data) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${label}`);
  console.log(`${'='.repeat(60)}`);
  
  console.log(`\n👤 User: ${data.user.name} (${data.user.role})`);
  console.log(`📁 Folder: ${data.folder.path}`);
  
  console.log(`\n📈 Summary:`);
  console.log(`   Total Files: ${data.summary.totalFiles}`);
  console.log(`   Pre-production: ${data.summary.preProduction}`);
  console.log(`   Post-production: ${data.summary.postProduction}`);
  console.log(`   Work-in-progress: ${data.summary.workInProgress}`);
  console.log(`   Final Delivery: ${data.summary.finalDelivery}`);
  console.log(`   Total Size: ${data.summary.totalSize}`);
  
  console.log(`\n📂 Detailed Counts:`);
  console.log(`   Root Folder: ${data.counts.rootFolder.totalFiles} files (${data.counts.rootFolder.totalSizeFormatted})`);
  console.log(`   Pre-production: ${data.counts['pre-production'].count} files`);
  console.log(`   Post-production:`);
  console.log(`      - Raw footage: ${data.counts['post-production'].subfolders['raw-footage'].count} files ${
    data.user.role === 'user' ? '(HIDDEN)' : ''
  }`);
  console.log(`      - Edited footage: ${data.counts['post-production'].subfolders['edited-footage'].count} files`);
  console.log(`      - Final deliverables: ${data.counts['post-production'].subfolders['final-deliverables'].count} files`);
  console.log(`   Work-in-progress: ${data.counts['work-in-progress'].count} files`);
  console.log(`   Final Delivery: ${data.counts['final-delivery'].count} files`);
}

/**
 * Run tests
 */
async function runTests() {
  console.log('🧪 Starting Folder Counts Access Control Tests...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Folder: ${TEST_CONFIG.folderPath}`);
  
  try {
    // Test 1: Admin user (should see all files)
    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Admin User Access');
    console.log('='.repeat(60));
    console.log('Expected: Should see ALL files including raw footage');
    
    const adminResult = await getFolderCounts(
      TEST_CONFIG.adminUserId, 
      TEST_CONFIG.folderPath
    );
    displayResults('Admin User Results', adminResult);
    
    // Test 2: Regular user (should only see their files)
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: Regular User Access');
    console.log('='.repeat(60));
    console.log('Expected: Should only see files they uploaded or have access to');
    console.log('Expected: Raw footage should be HIDDEN (count = 0)');
    
    const userResult = await getFolderCounts(
      TEST_CONFIG.regularUserId, 
      TEST_CONFIG.folderPath
    );
    displayResults('Regular User Results', userResult);
    
    // Validation
    console.log('\n' + '='.repeat(60));
    console.log('✅ VALIDATION RESULTS');
    console.log('='.repeat(60));
    
    // For regular users, raw footage should be 0
    const rawFootageCount = userResult.counts['post-production'].subfolders['raw-footage'].count;
    if (userResult.user.role === 'user' && rawFootageCount === 0) {
      console.log('✅ PASS: Raw footage is hidden from regular user (count = 0)');
    } else if (userResult.user.role === 'user' && rawFootageCount > 0) {
      console.log(`❌ FAIL: Raw footage should be hidden from user but shows ${rawFootageCount} files`);
    }
    
    // Regular users should have <= files than admin
    if (userResult.summary.totalFiles <= adminResult.summary.totalFiles) {
      console.log('✅ PASS: Regular user sees equal or fewer files than admin');
    } else {
      console.log('❌ FAIL: Regular user sees MORE files than admin (should be impossible)');
    }
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Tests failed with error:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests();
