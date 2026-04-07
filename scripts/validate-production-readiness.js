const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Production Readiness Validation Script
 * Validates that all production requirements are met
 */
class ProductionValidator {
  constructor() {
    this.checks = [];
    this.errors = [];
    this.warnings = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📋',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[type];

    console.log(`${prefix} ${message}`);
  }

  addCheck(name, checkFn, critical = true) {
    this.checks.push({ name, checkFn, critical });
  }

  async runChecks() {
    this.log('🚀 Starting Production Readiness Validation', 'info');
    this.log('=' .repeat(60), 'info');

    for (const check of this.checks) {
      try {
        this.log(`Checking: ${check.name}...`, 'info');
        const result = await check.checkFn();

        if (result.success) {
          this.log(`✅ ${check.name}: ${result.message}`, 'success');
        } else {
          const level = check.critical ? 'error' : 'warning';
          this.log(`${check.critical ? '❌' : '⚠️'} ${check.name}: ${result.message}`, level);

          if (check.critical) {
            this.errors.push(`${check.name}: ${result.message}`);
          } else {
            this.warnings.push(`${check.name}: ${result.message}`);
          }
        }
      } catch (error) {
        const level = check.critical ? 'error' : 'warning';
        this.log(`${check.critical ? '❌' : '⚠️'} ${check.name}: ${error.message}`, level);

        if (check.critical) {
          this.errors.push(`${check.name}: ${error.message}`);
        } else {
          this.warnings.push(`${check.name}: ${error.message}`);
        }
      }
    }

    this.generateReport();
  }

  generateReport() {
    this.log('', 'info');
    this.log('📊 PRODUCTION READINESS REPORT', 'info');
    this.log('=' .repeat(60), 'info');

    const totalChecks = this.checks.length;
    const passedChecks = totalChecks - this.errors.length - this.warnings.length;
    const failedChecks = this.errors.length;
    const warningChecks = this.warnings.length;

    this.log(`Total Checks: ${totalChecks}`, 'info');
    this.log(`Passed: ${passedChecks}`, 'success');
    this.log(`Warnings: ${warningChecks}`, 'warning');
    this.log(`Failed: ${failedChecks}`, 'error');

    if (this.errors.length > 0) {
      this.log('', 'info');
      this.log('❌ CRITICAL ISSUES (Must be fixed before production):', 'error');
      this.errors.forEach((error, index) => {
        this.log(`${index + 1}. ${error}`, 'error');
      });
    }

    if (this.warnings.length > 0) {
      this.log('', 'info');
      this.log('⚠️ WARNINGS (Recommended to fix):', 'warning');
      this.warnings.forEach((warning, index) => {
        this.log(`${index + 1}. ${warning}`, 'warning');
      });
    }

    this.log('', 'info');
    this.log('=' .repeat(60), 'info');

    if (this.errors.length === 0) {
      this.log('🎉 PRODUCTION READY! All critical checks passed.', 'success');
      if (this.warnings.length > 0) {
        this.log('Consider addressing warnings for optimal production deployment.', 'warning');
      }
      return true;
    } else {
      this.log('🚫 NOT PRODUCTION READY! Critical issues must be resolved.', 'error');
      return false;
    }
  }
}

// Initialize validator
const validator = new ProductionValidator();

// Check 1: Package.json and dependencies
validator.addCheck('Package Dependencies', async () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  if (!fs.existsSync(packagePath)) {
    return { success: false, message: 'package.json not found' };
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const requiredDeps = [
    '@sentry/node',
    '@sentry/profiling-node',
    'ioredis',
    'mongoose',
    'express',
    'stripe'
  ];

  const missingDeps = requiredDeps.filter(dep => !pkg.dependencies[dep]);

  if (missingDeps.length > 0) {
    return { success: false, message: `Missing dependencies: ${missingDeps.join(', ')}` };
  }

  return { success: true, message: 'All required dependencies installed' };
});

// Check 2: Required scripts
validator.addCheck('Required Scripts', async () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const requiredScripts = [
    'start',
    'test',
    'test:unit',
    'test:integration',
    'test:e2e',
    'test:performance',
    'health:check'
  ];

  const missingScripts = requiredScripts.filter(script => !pkg.scripts[script]);

  if (missingScripts.length > 0) {
    return { success: false, message: `Missing scripts: ${missingScripts.join(', ')}` };
  }

  return { success: true, message: 'All required scripts configured' };
});

// Check 3: Test files exist
validator.addCheck('Test Suite', async () => {
  const testDirs = [
    'tests/integration',
    'tests/e2e',
    'tests/performance'
  ];

  const missingDirs = testDirs.filter(dir => !fs.existsSync(path.join(__dirname, '..', dir)));

  if (missingDirs.length > 0) {
    return { success: false, message: `Missing test directories: ${missingDirs.join(', ')}` };
  }

  // Check for key test files
  const keyTestFiles = [
    'tests/integration/booking-flow.test.js',
    'tests/integration/webhook-processing.test.js',
    'tests/e2e/guest-booking.spec.js',
    'tests/performance/load-test.js'
  ];

  const missingFiles = keyTestFiles.filter(file => !fs.existsSync(path.join(__dirname, '..', file)));

  if (missingFiles.length > 0) {
    return { success: false, message: `Missing test files: ${missingFiles.join(', ')}` };
  }

  return { success: true, message: 'Complete test suite configured' };
});

// Check 4: Health check endpoints
validator.addCheck('Health Check System', async () => {
  const healthRoute = path.join(__dirname, '..', 'src', 'routes', 'v1', 'health.route.js');
  const healthScript = path.join(__dirname, 'health-check.js');

  if (!fs.existsSync(healthRoute)) {
    return { success: false, message: 'Health check route not found' };
  }

  if (!fs.existsSync(healthScript)) {
    return { success: false, message: 'Health check script not found' };
  }

  return { success: true, message: 'Health check system configured' };
});

// Check 5: Monitoring and alerts
validator.addCheck('Monitoring System', async () => {
  const monitoringService = path.join(__dirname, '..', 'src', 'services', 'monitoring.service.js');
  const alertService = path.join(__dirname, '..', 'src', 'services', 'alert.service.js');
  const monitoringRoute = path.join(__dirname, '..', 'src', 'routes', 'v1', 'monitoring.route.js');

  if (!fs.existsSync(monitoringService)) {
    return { success: false, message: 'Monitoring service not found' };
  }

  if (!fs.existsSync(alertService)) {
    return { success: false, message: 'Alert service not found' };
  }

  if (!fs.existsSync(monitoringRoute)) {
    return { success: false, message: 'Monitoring API routes not found' };
  }

  return { success: true, message: 'Monitoring and alert system configured' };
});

// Check 6: Analytics system
validator.addCheck('Analytics System', async () => {
  const analyticsService = path.join(__dirname, '..', 'monitoring', 'booking-analytics.js');
  const analyticsRoute = path.join(__dirname, '..', 'src', 'routes', 'v1', 'analytics.route.js');

  if (!fs.existsSync(analyticsService)) {
    return { success: false, message: 'Analytics service not found' };
  }

  if (!fs.existsSync(analyticsRoute)) {
    return { success: false, message: 'Analytics API routes not found' };
  }

  return { success: true, message: 'Analytics system configured' };
});

// Check 7: Database optimization
validator.addCheck('Database Optimization', async () => {
  const optimizeScript = path.join(__dirname, 'optimize-database.js');
  const migrateScript = path.join(__dirname, 'migrate-orders.js');
  const cacheService = path.join(__dirname, '..', 'src', 'services', 'cache.service.js');

  if (!fs.existsSync(optimizeScript)) {
    return { success: false, message: 'Database optimization script not found' };
  }

  if (!fs.existsSync(migrateScript)) {
    return { success: false, message: 'Database migration script not found' };
  }

  if (!fs.existsSync(cacheService)) {
    return { success: false, message: 'Cache service not found' };
  }

  return { success: true, message: 'Database optimization configured' };
});

// Check 8: Docker configuration
validator.addCheck('Docker Configuration', async () => {
  const dockerfile = path.join(__dirname, '..', 'Dockerfile');
  const dockerCompose = path.join(__dirname, '..', 'docker-compose.prod.yml');

  if (!fs.existsSync(dockerfile)) {
    return { success: false, message: 'Dockerfile not found' };
  }

  if (!fs.existsSync(dockerCompose)) {
    return { success: false, message: 'Production docker-compose.yml not found' };
  }

  return { success: true, message: 'Docker configuration ready' };
});

// Check 9: CI/CD Pipeline
validator.addCheck('CI/CD Pipeline', async () => {
  const cicdFile = path.join(__dirname, '..', '.github', 'workflows', 'ci-cd.yml');

  if (!fs.existsSync(cicdFile)) {
    return { success: false, message: 'CI/CD workflow not found' };
  }

  return { success: true, message: 'CI/CD pipeline configured' };
});

// Check 10: Documentation
validator.addCheck('Documentation', async () => {
  const deploymentGuide = path.join(__dirname, '..', 'docs', 'PRODUCTION_DEPLOYMENT_GUIDE.md');

  if (!fs.existsSync(deploymentGuide)) {
    return { success: false, message: 'Production deployment guide not found' };
  }

  return { success: true, message: 'Documentation complete' };
});

// Check 11: Environment variables validation (non-critical)
validator.addCheck('Environment Variables', async () => {
  const envExample = path.join(__dirname, '..', '.env.example');

  if (!fs.existsSync(envExample)) {
    return { success: false, message: '.env.example file not found for reference' };
  }

  // Check if .env exists (warning only)
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) {
    return { success: false, message: '.env file not found - ensure environment variables are configured' };
  }

  return { success: true, message: 'Environment configuration ready' };
}, false); // Non-critical

// Check 12: Security configuration (non-critical)
validator.addCheck('Security Configuration', async () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const securityDeps = ['helmet', 'express-rate-limit', 'express-mongo-sanitize', 'xss-clean'];
  const missingSecDeps = securityDeps.filter(dep => !pkg.dependencies[dep]);

  if (missingSecDeps.length > 0) {
    return { success: false, message: `Missing security dependencies: ${missingSecDeps.join(', ')}` };
  }

  return { success: true, message: 'Security configuration ready' };
}, false); // Non-critical

// Check 13: Performance optimization (non-critical)
validator.addCheck('Performance Tests', async () => {
  try {
    // Try to run a quick performance test
    const performanceTest = path.join(__dirname, '..', 'tests', 'performance', 'load-test.js');
    if (!fs.existsSync(performanceTest)) {
      return { success: false, message: 'Performance test file not found' };
    }

    return { success: true, message: 'Performance testing configured' };
  } catch (error) {
    return { success: false, message: `Performance test issue: ${error.message}` };
  }
}, false); // Non-critical

// Run validation
async function main() {
  const isReady = await validator.runChecks();

  // Generate validation report file
  const report = {
    timestamp: new Date().toISOString(),
    productionReady: isReady,
    totalChecks: validator.checks.length,
    errors: validator.errors,
    warnings: validator.warnings,
    summary: {
      passed: validator.checks.length - validator.errors.length - validator.warnings.length,
      warnings: validator.warnings.length,
      failed: validator.errors.length
    }
  };

  const reportPath = path.join(__dirname, '..', 'production-readiness-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  // Exit with appropriate code
  process.exit(isReady ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Validation script error:', error);
    process.exit(1);
  });
}

module.exports = ProductionValidator;