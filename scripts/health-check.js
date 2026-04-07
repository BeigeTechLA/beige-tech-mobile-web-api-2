const axios = require('axios');

/**
 * Standalone Health Check Script
 * Can be used by monitoring systems, CI/CD, or manual health verification
 */

class HealthChecker {
  constructor(baseUrl = 'http://localhost:5001') {
    this.baseUrl = baseUrl;
    this.timeout = 10000; // 10 seconds
    this.results = {};
  }

  async checkEndpoint(endpoint, expectedStatus = 200) {
    const url = `${this.baseUrl}/api/v1/health${endpoint}`;

    try {
      const startTime = Date.now();
      const response = await axios.get(url, {
        timeout: this.timeout,
        validateStatus: (status) => status < 600 // Don't throw on 4xx/5xx
      });

      const responseTime = Date.now() - startTime;

      return {
        endpoint,
        status: response.status,
        expectedStatus,
        passed: response.status === expectedStatus,
        responseTime,
        data: response.data,
        error: null
      };

    } catch (error) {
      return {
        endpoint,
        status: null,
        expectedStatus,
        passed: false,
        responseTime: null,
        data: null,
        error: error.message
      };
    }
  }

  async runAllChecks() {
    console.log(`🔍 Running health checks against ${this.baseUrl}...\n`);

    const checks = [
      { endpoint: '', name: 'Basic Health', expectedStatus: 200 },
      { endpoint: '/live', name: 'Liveness Probe', expectedStatus: 200 },
      { endpoint: '/ready', name: 'Readiness Probe', expectedStatus: 200 },
      { endpoint: '/detailed', name: 'Detailed Health', expectedStatus: 200 },
      { endpoint: '/database', name: 'Database Health', expectedStatus: 200 },
      { endpoint: '/cache', name: 'Cache Health', expectedStatus: 200 },
      { endpoint: '/application', name: 'Application Health', expectedStatus: 200 },
      { endpoint: '/metrics', name: 'Metrics', expectedStatus: 200 }
    ];

    const results = [];

    for (const check of checks) {
      const result = await this.checkEndpoint(check.endpoint, check.expectedStatus);
      result.name = check.name;
      results.push(result);

      const statusIcon = result.passed ? '✅' : '❌';
      const responseTimeStr = result.responseTime ? `(${result.responseTime}ms)` : '';

      console.log(`${statusIcon} ${check.name}: ${result.status || 'TIMEOUT'} ${responseTimeStr}`);

      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }

      // Brief delay between checks
      await this.sleep(100);
    }

    this.results = results;
    return results;
  }

  async checkDependencies() {
    console.log('\n🔧 Checking dependencies...\n');

    try {
      const detailedResult = await this.checkEndpoint('/detailed');

      if (detailedResult.passed && detailedResult.data.dependencies) {
        const deps = detailedResult.data.dependencies;

        Object.entries(deps).forEach(([service, status]) => {
          const icon = status.status === 'healthy' ? '✅' : status.status === 'degraded' ? '⚠️' : '❌';
          const responseTime = status.responseTime ? `(${status.responseTime}ms)` : '';

          console.log(`${icon} ${service}: ${status.status} ${responseTime}`);

          if (status.error) {
            console.log(`   Error: ${status.error}`);
          }
        });
      } else {
        console.log('❌ Could not retrieve dependency status');
      }

    } catch (error) {
      console.log(`❌ Error checking dependencies: ${error.message}`);
    }
  }

  async checkPerformance() {
    console.log('\n⚡ Performance benchmarks...\n');

    const performanceChecks = [
      { endpoint: '', name: 'Basic Health', maxTime: 100 },
      { endpoint: '/database', name: 'Database Check', maxTime: 500 },
      { endpoint: '/cache', name: 'Cache Check', maxTime: 200 },
      { endpoint: '/metrics', name: 'Metrics Collection', maxTime: 1000 }
    ];

    for (const check of performanceChecks) {
      const result = await this.checkEndpoint(check.endpoint);

      if (result.responseTime !== null) {
        const passed = result.responseTime <= check.maxTime;
        const icon = passed ? '✅' : '⚠️';

        console.log(`${icon} ${check.name}: ${result.responseTime}ms (max: ${check.maxTime}ms)`);

        if (!passed) {
          console.log(`   ⚠️ Response time exceeded threshold`);
        }
      } else {
        console.log(`❌ ${check.name}: No response`);
      }
    }
  }

  generateReport() {
    console.log('\n📊 HEALTH CHECK REPORT\n');
    console.log('=' .repeat(50));

    const totalChecks = this.results.length;
    const passedChecks = this.results.filter(r => r.passed).length;
    const failedChecks = totalChecks - passedChecks;

    console.log(`Total Checks: ${totalChecks}`);
    console.log(`Passed: ${passedChecks}`);
    console.log(`Failed: ${failedChecks}`);

    if (failedChecks > 0) {
      console.log('\n❌ Failed Checks:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error || `Status ${r.status}`}`);
        });
    }

    // Performance summary
    const responseTimes = this.results
      .filter(r => r.responseTime !== null)
      .map(r => r.responseTime);

    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log('\n⚡ Performance Summary:');
      console.log(`  Average Response Time: ${Math.round(avgResponseTime)}ms`);
      console.log(`  Slowest Response: ${maxResponseTime}ms`);
    }

    console.log('\n' + '=' .repeat(50));

    const overallStatus = failedChecks === 0 ? 'HEALTHY' : 'DEGRADED';
    const statusIcon = failedChecks === 0 ? '✅' : '⚠️';

    console.log(`${statusIcon} Overall Status: ${overallStatus}\n`);

    return {
      overall: overallStatus,
      totalChecks,
      passedChecks,
      failedChecks,
      avgResponseTime: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null
    };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Export results for monitoring systems
  exportResults(format = 'json') {
    const summary = {
      timestamp: new Date().toISOString(),
      baseUrl: this.baseUrl,
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length
      }
    };

    switch (format) {
      case 'json':
        return JSON.stringify(summary, null, 2);
      case 'prometheus':
        return this.generatePrometheusMetrics(summary);
      default:
        return summary;
    }
  }

  generatePrometheusMetrics(summary) {
    let metrics = '# HELP beige_health_check Health check results\n';
    metrics += '# TYPE beige_health_check gauge\n';

    this.results.forEach(result => {
      const value = result.passed ? 1 : 0;
      const endpoint = result.endpoint || 'root';
      metrics += `beige_health_check{endpoint="${endpoint}",name="${result.name}"} ${value}\n`;
    });

    metrics += '\n# HELP beige_health_response_time Health check response times in milliseconds\n';
    metrics += '# TYPE beige_health_response_time gauge\n';

    this.results.forEach(result => {
      if (result.responseTime !== null) {
        const endpoint = result.endpoint || 'root';
        metrics += `beige_health_response_time{endpoint="${endpoint}",name="${result.name}"} ${result.responseTime}\n`;
      }
    });

    return metrics;
  }
}

/**
 * Continuous monitoring function
 */
async function continuousMonitoring(intervalMinutes = 5, maxRuns = 0) {
  console.log(`🔄 Starting continuous monitoring (every ${intervalMinutes} minutes)...\n`);

  let runCount = 0;
  const checker = new HealthChecker();

  const runCheck = async () => {
    runCount++;
    console.log(`\n📋 Health Check Run #${runCount} - ${new Date().toISOString()}`);

    try {
      await checker.runAllChecks();
      const report = checker.generateReport();

      // Track health check in alert service if available
      try {
        const alertService = require('../src/services/alert.service');
        alertService.trackHealthCheck(
          report.failedChecks === 0,
          report.avgResponseTime,
          checker.results.reduce((acc, result) => {
            acc[result.name] = { status: result.passed ? 'healthy' : 'unhealthy' };
            return acc;
          }, {})
        );
      } catch (alertError) {
        // Alert service not available, continue without it
      }

      // Log to file or send to monitoring system
      if (process.env.HEALTH_CHECK_LOG_FILE) {
        const fs = require('fs');
        const logEntry = {
          timestamp: new Date().toISOString(),
          run: runCount,
          report
        };
        fs.appendFileSync(process.env.HEALTH_CHECK_LOG_FILE, JSON.stringify(logEntry) + '\n');
      }

      // Alert on failures
      if (report.failedChecks > 0) {
        console.log('⚠️ Health check failures detected - consider alerting');
      }

    } catch (error) {
      console.error(`❌ Health check run failed: ${error.message}`);
    }

    if (maxRuns > 0 && runCount >= maxRuns) {
      console.log(`✅ Completed ${maxRuns} monitoring runs`);
      return;
    }

    // Schedule next run
    setTimeout(runCheck, intervalMinutes * 60 * 1000);
  };

  // Start first run
  await runCheck();
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const baseUrl = args.find(arg => arg.startsWith('--url='))?.split('=')[1] || 'http://localhost:5001';
  const continuous = args.includes('--continuous');
  const interval = parseInt(args.find(arg => arg.startsWith('--interval='))?.split('=')[1]) || 5;
  const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'console';

  const checker = new HealthChecker(baseUrl);

  try {
    if (continuous) {
      await continuousMonitoring(interval);
    } else {
      // Single run
      await checker.runAllChecks();
      await checker.checkDependencies();
      await checker.checkPerformance();

      const report = checker.generateReport();

      // Export results if requested
      if (format !== 'console') {
        console.log('\n📤 Exported Results:\n');
        console.log(checker.exportResults(format));
      }

      // Exit with error code if health checks failed
      process.exit(report.failedChecks > 0 ? 1 : 0);
    }

  } catch (error) {
    console.error(`❌ Health checker error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  HealthChecker,
  continuousMonitoring
};