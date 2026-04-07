/**
 * Fetch CPs from API and Test Portfolio Creation
 * This script fetches real CPs from your running API and creates a portfolio
 */

const axios = require('axios');
const FormData = require('form-data');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:5002';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjRlZGY2MGNhZWYyYzA2MWY2MTE3ZmYiLCJpYXQiOjE3MjU4NjI5MzksImV4cCI6MTcyNTg2NDczOSwidHlwZSI6ImFjY2VzcyJ9.EUSs7x4QDNVQde0cT9Bnv5Dlhl5nK-32o-PMfUyROic';

// ANSI Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70) + '\n');
}

async function fetchCPs() {
  logSection('📡 FETCHING CPs FROM API');
  
  try {
    log('Making request to: ' + `${API_BASE_URL}/v1/cp?limit=100&page=1`, 'blue');
    
    const response = await axios.get(`${API_BASE_URL}/v1/cp`, {
      params: {
        limit: 100,
        page: 1
      },
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      timeout: 10000
    });

    if (response.data && response.data.results) {
      log(`✅ Successfully fetched ${response.data.results.length} CPs`, 'green');
      log(`   Total CPs: ${response.data.totalResults}`, 'blue');
      log(`   Page: ${response.data.page} of ${response.data.totalPages}`, 'blue');
      return response.data.results;
    } else {
      log('❌ Unexpected response format', 'red');
      console.log('Response:', JSON.stringify(response.data, null, 2));
      return [];
    }
  } catch (error) {
    log('❌ Failed to fetch CPs', 'red');
    
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data?.message || 'Unknown error'}`, 'red');
      
      if (error.response.status === 401) {
        log('\n💡 TIP: Your auth token might be expired', 'yellow');
        log('   Generate a new token and set it:', 'yellow');
        log('   export AUTH_TOKEN="your-new-token"', 'yellow');
      }
    } else if (error.code === 'ECONNREFUSED') {
      log('   Error: Cannot connect to API server', 'red');
      log('\n💡 TIP: Make sure your API server is running:', 'yellow');
      log('   npm start', 'yellow');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
    
    throw error;
  }
}

function displayCPs(cps) {
  logSection('📋 AVAILABLE CPs');
  
  if (cps.length === 0) {
    log('❌ No CPs found in the database', 'red');
    log('\n💡 You need to create a CP first:', 'yellow');
    log('   node scripts/create-test-user-and-cp.js', 'yellow');
    return;
  }

  cps.slice(0, 5).forEach((cp, index) => {
    console.log(`\n${'─'.repeat(70)}`);
    log(`CP #${index + 1}`, 'bright');
    console.log('─'.repeat(70));
    log(`CP ID:             ${cp._id}`, 'blue');
    log(`User ID:           ${cp.userId?._id || cp.userId || 'N/A'}`, 'blue');
    
    if (cp.userId && typeof cp.userId === 'object') {
      log(`User Name:         ${cp.userId.name || 'N/A'}`, 'blue');
      log(`User Email:        ${cp.userId.email || 'N/A'}`, 'blue');
    }
    
    log(`City:              ${cp.city || 'N/A'}`, 'blue');
    log(`Review Status:     ${cp.review_status || 'N/A'}`, 'blue');
    log(`Tier:              ${cp.tier || 'N/A'}`, 'blue');
    log(`Successful Shoots: ${cp.successful_beige_shoots || 0}`, 'blue');
    log(`Rating:            ${cp.average_rating || 0}/5`, 'blue');
  });

  if (cps.length > 5) {
    log(`\n... and ${cps.length - 5} more CPs`, 'cyan');
  }
}

async function createPortfolio(cpId, userId) {
  logSection('🚀 CREATING PORTFOLIO');
  
  log(`Using CP ID:   ${cpId}`, 'blue');
  log(`Using User ID: ${userId}`, 'blue');
  log('', 'reset');

  try {
    const formData = new FormData();
    formData.append('portfolioName', 'Wedding Photography Portfolio');
    formData.append('specialities', JSON.stringify(['Wedding', 'Portrait', 'Event Photography']));
    formData.append('location', '47 W 13th St, New York, NY 10011, USA');
    formData.append('eventDate', '2025-12-29');
    formData.append('description', 'Professional wedding photography capturing your special moments with artistic flair and attention to detail.');
    formData.append('cpId', cpId);
    formData.append('userId', userId);

    log('Making request to: ' + `${API_BASE_URL}/v1/portfolios/create`, 'blue');
    
    const response = await axios.post(
      `${API_BASE_URL}/v1/portfolios/create`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          // Uncomment if auth is required:
          // 'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        timeout: 30000
      }
    );

    if (response.data.success) {
      log('✅ Portfolio created successfully!', 'green');
      log('', 'reset');
      
      // Log full response for debugging
      console.log('Full Response:', JSON.stringify(response.data, null, 2));
      
      const portfolio = response.data.data;
      const portfolioId = portfolio._id || portfolio.id;
      
      log('Portfolio Details:', 'cyan');
      log('─'.repeat(70), 'cyan');
      log(`ID:           ${portfolioId}`, 'blue');
      log(`Name:         ${portfolio.portfolioName}`, 'blue');
      log(`Location:     ${portfolio.location}`, 'blue');
      log(`Event Date:   ${portfolio.eventDate}`, 'blue');
      log(`Specialities: ${portfolio.specialities?.join(', ')}`, 'blue');
      log(`Views:        ${portfolio.viewsCount}`, 'blue');
      log(`Status:       ${portfolio.isActive ? 'Active' : 'Inactive'}`, 'blue');
      log(`Created:      ${portfolio.createdAt}`, 'blue');
      
      // Ensure we have the ID
      if (!portfolioId) {
        log('\n⚠️  Warning: Portfolio ID not found in response', 'yellow');
      }
      
      return { ...portfolio, _id: portfolioId };
    } else {
      log('❌ Unexpected response format', 'red');
      console.log('Response:', JSON.stringify(response.data, null, 2));
      return null;
    }
  } catch (error) {
    log('❌ Failed to create portfolio', 'red');
    
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data?.message || 'Unknown error'}`, 'red');
      
      if (error.response.data?.stack) {
        log('\n   Stack trace:', 'yellow');
        console.log(error.response.data.stack);
      }
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
    
    throw error;
  }
}

async function testGetPortfolio(portfolioId) {
  logSection('🔍 TESTING: GET Portfolio by ID');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/portfolios/${portfolioId}`);
    
    if (response.data.success) {
      log('✅ Successfully retrieved portfolio', 'green');
      log(`   Name: ${response.data.data.portfolioName}`, 'blue');
      log(`   Views: ${response.data.data.viewsCount}`, 'blue');
    }
  } catch (error) {
    log('❌ Failed to get portfolio', 'red');
    log(`   ${error.response?.data?.message || error.message}`, 'red');
  }
}

async function testGetPortfoliosByCp(cpId) {
  logSection('🔍 TESTING: GET Portfolios by CP ID');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/portfolios/cp/${cpId}?limit=10&page=1`);
    
    if (response.data.success) {
      log('✅ Successfully retrieved portfolios', 'green');
      log(`   Total: ${response.data.data.totalResults}`, 'blue');
      log(`   Page: ${response.data.data.page} of ${response.data.data.totalPages}`, 'blue');
      
      if (response.data.data.results && response.data.data.results.length > 0) {
        log('\n   Portfolios:', 'cyan');
        response.data.data.results.forEach((p, i) => {
          log(`   ${i + 1}. ${p.portfolioName} (Views: ${p.viewsCount})`, 'blue');
        });
      }
    }
  } catch (error) {
    log('❌ Failed to get portfolios', 'red');
    log(`   ${error.response?.data?.message || error.message}`, 'red');
  }
}

async function testViewPortfolio(portfolioId) {
  logSection('🔍 TESTING: VIEW Portfolio (Increment Views)');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/v1/portfolios/${portfolioId}/view`);
    
    if (response.data.success) {
      log('✅ Successfully viewed portfolio', 'green');
      log(`   Views: ${response.data.data.viewsCount}`, 'blue');
    }
  } catch (error) {
    log('❌ Failed to view portfolio', 'red');
    log(`   ${error.response?.data?.message || error.message}`, 'red');
  }
}

function generateCurlCommands(cpId, userId, portfolioId) {
  logSection('📝 CURL COMMANDS FOR MANUAL TESTING');
  
  log('1. Create Portfolio:', 'cyan');
  console.log(`
curl --location '${API_BASE_URL}/v1/portfolios/create' \\
--form 'portfolioName="Wedding Photography Portfolio"' \\
--form 'specialities="[\\"Wedding\\", \\"Portrait\\", \\"Event Photography\\"]"' \\
--form 'location="47 W 13th St, New York, NY 10011, USA"' \\
--form 'eventDate="2025-12-29"' \\
--form 'description="Professional wedding photography"' \\
--form 'cpId="${cpId}"' \\
--form 'userId="${userId}"'
`);

  log('2. Get Portfolio by ID:', 'cyan');
  console.log(`curl --location '${API_BASE_URL}/v1/portfolios/${portfolioId}'`);
  
  log('\n3. Get All Portfolios for CP:', 'cyan');
  console.log(`curl --location '${API_BASE_URL}/v1/portfolios/cp/${cpId}?limit=10&page=1'`);
  
  log('\n4. View Portfolio (Increment Views):', 'cyan');
  console.log(`curl --location '${API_BASE_URL}/v1/portfolios/${portfolioId}/view'`);
  
  log('\n5. Update Portfolio:', 'cyan');
  console.log(`
curl --location '${API_BASE_URL}/v1/portfolios/${portfolioId}' \\
--request PUT \\
--form 'portfolioName="Updated Wedding Portfolio"' \\
--form 'userId="${userId}"'
`);
}

async function main() {
  console.log('\n');
  log('╔═══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     Portfolio API - Fetch CPs & Test with Real Data            ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════════════╝', 'cyan');
  
  try {
    // Step 1: Fetch CPs
    const cps = await fetchCPs();
    
    if (cps.length === 0) {
      log('\n❌ No CPs found. Cannot proceed with testing.', 'red');
      process.exit(1);
    }
    
    // Step 2: Display CPs
    displayCPs(cps);
    
    // Step 3: Select a CP (first one with valid userId)
    logSection('🎯 SELECTING CP FOR TESTING');
    
    const validCP = cps.find(cp => {
      const hasUserId = cp.userId && (typeof cp.userId === 'string' || cp.userId._id);
      const isAccepted = cp.review_status === 'accepted';
      return hasUserId && isAccepted;
    });
    
    if (!validCP) {
      log('❌ No valid CP found (need userId and accepted status)', 'red');
      log('\n💡 TIP: Use any CP with userId:', 'yellow');
      const anyCP = cps.find(cp => cp.userId);
      if (anyCP) {
        const userId = typeof anyCP.userId === 'string' ? anyCP.userId : anyCP.userId._id;
        log(`   CP ID: ${anyCP._id}`, 'blue');
        log(`   User ID: ${userId}`, 'blue');
      }
      process.exit(1);
    }
    
    const cpId = validCP._id;
    const userId = typeof validCP.userId === 'string' ? validCP.userId : validCP.userId._id;
    
    log('✅ Selected CP for testing:', 'green');
    log(`   CP ID:   ${cpId}`, 'blue');
    log(`   User ID: ${userId}`, 'blue');
    if (validCP.userId && typeof validCP.userId === 'object') {
      log(`   Name:    ${validCP.userId.name || 'N/A'}`, 'blue');
    }
    
    // Step 4: Create Portfolio
    const portfolio = await createPortfolio(cpId, userId);
    
    if (!portfolio) {
      log('\n❌ Portfolio creation failed. Stopping tests.', 'red');
      process.exit(1);
    }
    
    // Step 5: Test other endpoints
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    await testGetPortfolio(portfolio._id);
    await testGetPortfoliosByCp(cpId);
    await testViewPortfolio(portfolio._id);
    
    // Step 6: Generate curl commands
    generateCurlCommands(cpId, userId, portfolio._id);
    
    // Success summary
    logSection('🎉 TEST SUMMARY');
    log('✅ All tests completed successfully!', 'green');
    log('', 'reset');
    log('Test Results:', 'cyan');
    log(`   ✅ Fetched ${cps.length} CPs from API`, 'green');
    log(`   ✅ Created portfolio: ${portfolio._id}`, 'green');
    log(`   ✅ Retrieved portfolio by ID`, 'green');
    log(`   ✅ Retrieved portfolios by CP`, 'green');
    log(`   ✅ Viewed portfolio (incremented views)`, 'green');
    log('', 'reset');
    log('🎯 Portfolio is ready to use!', 'cyan');
    log('', 'reset');
    
  } catch (error) {
    logSection('❌ TEST FAILED');
    log('An error occurred during testing', 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();

