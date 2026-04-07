const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/**
 * Global teardown for E2E tests
 * Runs once after all tests complete
 */
async function globalTeardown(config) {
  console.log('🧹 Cleaning up E2E test environment...');

  // Close database connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    console.log('📦 Disconnected from test database');
  }

  // Stop in-memory MongoDB server
  if (global.mongoServer) {
    await global.mongoServer.stop();
    console.log('🛑 Stopped test database server');
  }

  // Clean up auth state file
  const authStatePath = path.join(__dirname, 'auth-state.json');
  if (fs.existsSync(authStatePath)) {
    fs.unlinkSync(authStatePath);
    console.log('🗑️ Cleaned up auth state file');
  }

  // Clean up test screenshots and videos if not CI
  if (!process.env.CI) {
    const testResultsDir = path.join(__dirname, '../../test-results');
    if (fs.existsSync(testResultsDir)) {
      // Only remove if all tests passed
      const resultsFile = path.join(testResultsDir, 'e2e-results.json');
      if (fs.existsSync(resultsFile)) {
        const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        if (results.stats && results.stats.failures === 0) {
          fs.rmSync(testResultsDir, { recursive: true, force: true });
          console.log('🗑️ Cleaned up test artifacts (all tests passed)');
        }
      }
    }
  }

  console.log('✅ E2E test environment cleanup complete');
}

module.exports = globalTeardown;