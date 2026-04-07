const axios = require('axios');
require('dotenv').config();

const FRAMEIO_TOKEN = process.env.FRAMEIO_TOKEN;
const FRAMEIO_PROJECT_ID = process.env.FRAMEIO_PROJECT_ID;

async function testFrameio() {
  const client = axios.create({
    baseURL: 'https://api.frame.io/v2',
    headers: {
      'Authorization': `Bearer ${FRAMEIO_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  try {
    // Test 1: Get user info
    console.log('🧪 Test 1: Getting user info...');
    const meResponse = await client.get('/me');
    console.log('✅ User:', meResponse.data.email, '-', meResponse.data.name);
    console.log('   Account ID:', meResponse.data.account_id);
    
    const accountId = meResponse.data.account_id;

    // Test 2: Get teams
    console.log('\n🧪 Test 2: Getting teams...');
    try {
      const teamsResponse = await client.get(`/accounts/${accountId}/teams`);
      console.log(`✅ Found ${teamsResponse.data.length} teams`);
      teamsResponse.data.forEach(team => {
        console.log(`   - ${team.name} (ID: ${team.id})`);
      });
    } catch (err) {
      console.log('❌ Teams error:', err.response?.status, err.response?.data?.message);
    }

    // Test 3: Try direct project access
    console.log(`\n🧪 Test 3: Trying to access project directly: ${FRAMEIO_PROJECT_ID}`);
    try {
      const projectResponse = await client.get(`/projects/${FRAMEIO_PROJECT_ID}`);
      console.log('✅ Project found:', projectResponse.data.name);
      console.log('   Root Asset ID:', projectResponse.data.root_asset_id);
    } catch (err) {
      console.log('❌ Project access error:', err.response?.status, err.response?.data?.message);
    }

    // Test 4: List all accessible projects
    console.log('\n🧪 Test 4: Listing all accessible projects...');
    try {
      const projectsResponse = await client.get(`/accounts/${accountId}/projects`);
      console.log(`✅ Found ${projectsResponse.data.length} projects:`);
      projectsResponse.data.forEach(project => {
        console.log(`   - ${project.name} (ID: ${project.id})`);
        console.log(`     Root Asset ID: ${project.root_asset_id}`);
      });
    } catch (err) {
      console.log('❌ Projects listing error:', err.response?.status, err.response?.data?.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testFrameio();
