// Test script to check Frame.io projects
const axios = require('axios');
require('dotenv').config();

const FRAMEIO_TOKEN = process.env.FRAMEIO_TOKEN;
const FRAMEIO_API_V2 = 'https://api.frame.io/v2';

async function testFrameio() {
  try {
    const client = axios.create({
      baseURL: FRAMEIO_API_V2,
      headers: {
        'Authorization': `Bearer ${FRAMEIO_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('🔍 Testing Frame.io API...\n');

    // Get user info
    const meResponse = await client.get('/me');
    const accountId = meResponse.data.account_id;
    console.log('✅ Authenticated as:', meResponse.data.name);
    console.log('📧 Email:', meResponse.data.email);
    console.log('🆔 Account ID:', accountId);
    console.log('');

    // Get teams
    console.log('📂 Fetching teams...');
    const teamsResponse = await client.get(`/accounts/${accountId}/teams`);
    const teams = teamsResponse.data || [];
    console.log(`Found ${teams.length} team(s)\n`);

    // Try to get projects directly from account
    console.log('📂 Trying direct account projects...');
    try {
      const directProjectsResponse = await client.get(`/accounts/${accountId}/projects`);
      const directProjects = directProjectsResponse.data || [];

      if (directProjects.length > 0) {
        console.log(`Found ${directProjects.length} project(s) on account:\n`);
        directProjects.forEach(project => {
          console.log(`   ✓ Project: ${project.name}`);
          console.log(`     - ID: ${project.id}`);
          console.log(`     - Root Asset ID: ${project.root_asset_id}`);
        });
      } else {
        console.log('No projects found on account');
      }
    } catch (err) {
      console.log(`❌ Error: ${err.response?.status} ${err.response?.statusText}`);
      if (err.response?.data) {
        console.log('Response:', JSON.stringify(err.response.data, null, 2));
      }
    }
    console.log('');

    // Get projects from each team
    for (const team of teams) {
      console.log(`📁 Team: ${team.name} (ID: ${team.id})`);

      try {
        const projectsResponse = await client.get(`/teams/${team.id}/projects`);
        const projects = projectsResponse.data || [];

        if (projects.length === 0) {
          console.log('   No projects found');
        } else {
          projects.forEach(project => {
            console.log(`   ✓ Project: ${project.name}`);
            console.log(`     - ID: ${project.id}`);
            console.log(`     - Root Asset ID: ${project.root_asset_id}`);
          });
        }
      } catch (err) {
        console.log(`   ❌ Error fetching projects: ${err.response?.status} ${err.response?.statusText}`);
      }
      console.log('');
    }

    // Try checking the configured project ID
    const configuredProjectId = process.env.FRAMEIO_PROJECT_ID;
    if (configuredProjectId) {
      console.log(`\n🔍 Checking configured project: ${configuredProjectId}`);

      try {
        const projectResponse = await client.get(`/projects/${configuredProjectId}`);
        console.log('✅ Found project via /projects endpoint:');
        console.log(`   Name: ${projectResponse.data.name}`);
        console.log(`   ID: ${projectResponse.data.id}`);
        console.log(`   Root Asset ID: ${projectResponse.data.root_asset_id}`);
      } catch (projErr) {
        console.log(`❌ Project not accessible: ${projErr.response?.status} ${projErr.response?.statusText}`);

        // Try as asset
        try {
          const assetResponse = await client.get(`/assets/${configuredProjectId}`);
          console.log('✅ Found as asset/folder:');
          console.log(`   Name: ${assetResponse.data.name}`);
          console.log(`   Type: ${assetResponse.data.type}`);
          console.log(`   ID: ${assetResponse.data.id}`);
          console.log('\n💡 This ID can be used directly for uploads');
        } catch (assetErr) {
          console.log(`❌ Not accessible as asset either: ${assetErr.response?.status} ${assetErr.response?.statusText}`);
          console.log('\n⚠️ The configured FRAMEIO_PROJECT_ID is not accessible with this token');
          console.log('Possible reasons:');
          console.log('  1. This is a next.frame.io project that requires Adobe OAuth');
          console.log('  2. The token doesn\'t have permission to access this project');
          console.log('  3. The project ID is incorrect');
        }
      }
    }

    console.log('\n💡 To enable auto-upload:');
    console.log('1. Copy the Project ID or Root Asset ID from above');
    console.log('2. Update FRAMEIO_PROJECT_ID in your .env file');
    console.log('3. Restart the backend server');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testFrameio();
