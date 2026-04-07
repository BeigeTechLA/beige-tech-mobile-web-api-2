const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const User = require('../../src/models/user.model');
const { chromium } = require('@playwright/test');

/**
 * Global setup for E2E tests
 * Runs once before all tests
 */
async function globalSetup(config) {
  console.log('🚀 Setting up E2E test environment...');

  // Start in-memory MongoDB for E2E tests
  global.mongoServer = await MongoMemoryServer.create();
  const mongoUri = global.mongoServer.getUri();

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('📦 Connected to test database');

  // Create test users for E2E scenarios
  const testUsers = await Promise.all([
    User.create({
      email: 'e2e.test@beige.app',
      firstName: 'E2E',
      lastName: 'TestUser',
      password: 'e2eTestPassword123',
      role: 'client',
      isEmailVerified: true
    }),
    User.create({
      email: 'e2e.admin@beige.app',
      firstName: 'E2E',
      lastName: 'Admin',
      password: 'e2eAdminPassword123',
      role: 'admin',
      isEmailVerified: true
    })
  ]);

  console.log('👥 Created test users for E2E tests');

  // Store test user credentials in global config for tests
  process.env.E2E_TEST_USER_EMAIL = testUsers[0].email;
  process.env.E2E_TEST_USER_PASSWORD = 'e2eTestPassword123';
  process.env.E2E_TEST_USER_ID = testUsers[0]._id.toString();

  process.env.E2E_ADMIN_EMAIL = testUsers[1].email;
  process.env.E2E_ADMIN_PASSWORD = 'e2eAdminPassword123';
  process.env.E2E_ADMIN_ID = testUsers[1]._id.toString();

  // Launch browser for authentication state setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Pre-authenticate the test user and store auth state
  try {
    await page.goto(config.use.baseURL);

    // Navigate to login page
    await page.click('[data-testid="login-button"]', { timeout: 5000 });

    // Fill login form
    await page.fill('[data-testid="email-input"]', testUsers[0].email);
    await page.fill('[data-testid="password-input"]', 'e2eTestPassword123');
    await page.click('[data-testid="login-submit"]');

    // Wait for login success
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 10000 });

    // Save authenticated state
    await context.storageState({ path: 'tests/e2e/auth-state.json' });

    console.log('🔐 Saved authenticated state for E2E tests');
  } catch (error) {
    console.log('⚠️ Could not pre-authenticate (frontend may not be running):', error.message);
  }

  await browser.close();

  // Set up test data
  await setupTestData();

  console.log('✅ E2E test environment setup complete');
}

/**
 * Setup test data for E2E scenarios
 */
async function setupTestData() {
  // Create test service types, locations, etc.
  const testData = {
    services: ['videography', 'photography', 'editing_only'],
    locations: ['Test Studio A', 'Test Studio B', 'Client Location'],
    contentTypes: ['photo', 'video', 'edit']
  };

  // Store test data in environment
  process.env.E2E_TEST_DATA = JSON.stringify(testData);
}

module.exports = globalSetup;