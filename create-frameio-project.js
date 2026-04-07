// Create a Frame.io project for auto-upload
const axios = require('axios');
require('dotenv').config();

const FRAMEIO_TOKEN = process.env.FRAMEIO_TOKEN;
const FRAMEIO_API_V2 = 'https://api.frame.io/v2';

async function createProject() {
  try {
    const client = axios.create({
      baseURL: FRAMEIO_API_V2,
      headers: {
        'Authorization': `Bearer ${FRAMEIO_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('🔍 Getting account info...\n');

    // Get user info
    const meResponse = await client.get('/me');
    const accountId = meResponse.data.account_id;
    console.log('✅ Authenticated as:', meResponse.data.name);
    console.log('🆔 Account ID:', accountId);
    console.log('');

    // Get or create a team
    console.log('📂 Checking for teams...');
    const teamsResponse = await client.get(`/accounts/${accountId}/teams`);
    const teams = teamsResponse.data || [];

    let teamId;
    if (teams.length > 0) {
      teamId = teams[0].id;
      console.log(`✅ Found team: ${teams[0].name} (${teamId})`);
    } else {
      console.log('⚠️ No teams found. Attempting to create one...');
      try {
        const createTeamResponse = await client.post(`/accounts/${accountId}/teams`, {
          name: 'Beige Team'
        });
        teamId = createTeamResponse.data.id;
        console.log(`✅ Created team: ${createTeamResponse.data.name} (${teamId})`);
      } catch (teamErr) {
        console.error('❌ Failed to create team:', teamErr.response?.data || teamErr.message);
        console.log('\n💡 You may need to create a team manually at https://app.frame.io');
        return;
      }
    }
    console.log('');

    // Create project
    console.log('📁 Creating project for Beige uploads...');
    try {
      const createProjectResponse = await client.post(`/teams/${teamId}/projects`, {
        name: 'Beige Uploads',
        private: false
      });

      const project = createProjectResponse.data;
      console.log('✅ Project created successfully!\n');
      console.log('   Project Name:', project.name);
      console.log('   Project ID:', project.id);
      console.log('   Root Asset ID:', project.root_asset_id);
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 UPDATE YOUR .ENV FILE:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`FRAMEIO_PROJECT_ID=${project.id}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('✅ After updating .env, restart your backend server');
      console.log('✅ Videos will now auto-upload to Frame.io!');

    } catch (projErr) {
      console.error('❌ Failed to create project:', projErr.response?.data || projErr.message);
      console.log('\n💡 You may need to create a project manually at https://app.frame.io');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

createProject();
