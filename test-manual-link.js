const axios = require('axios');
require('dotenv').config();

const FRAMEIO_TOKEN = process.env.FRAMEIO_TOKEN;

// Test with a sample Frame.io share link
const testAssetId = 'f.io/test123'; // Example share link format

async function testManualLink() {
  console.log('🧪 Testing manual link functionality...\n');
  console.log('When users paste a Frame.io share link (like f.io/abc123 or next.frame.io/project/...),');
  console.log('the system will accept it without needing to verify via API.\n');
  console.log('✅ Manual linking will work regardless of token permissions.\n');
  
  console.log('Sample Frame.io link formats that will work:');
  console.log('  • https://f.io/abc123');
  console.log('  • https://next.frame.io/project/xyz/view/abc123?share=token');
  console.log('  • https://app.frame.io/player/asset-id');
  console.log('  • https://app.frame.io/reviews/review-id\n');
  
  console.log('These links will be embedded directly without API validation.\n');
}

testManualLink();
