# Production Deployment & Testing Guide

## Overview
This guide provides step-by-step instructions for deploying and testing the production-ready authenticated checkout system.

## 📦 Dependencies Installation

### 1. Install New Dependencies
```bash
cd /path/to/BeigeBackEnd
yarn install
```

### 2. Install Playwright Browsers (for E2E tests)
```bash
yarn playwright:install
```

**Breaking Changes**: ❌ None - All new dependencies are dev dependencies or optional runtime dependencies that won't break existing functionality.

## 🔧 Redis Configuration (Digital Ocean)

### 1. Install Redis on Digital Ocean Droplet
```bash
# SSH into your Digital Ocean instance
ssh root@your-server-ip

# Update system
sudo apt update

# Install Redis
sudo apt install redis-server

# Configure Redis for production
sudo nano /etc/redis/redis.conf
```

### 2. Redis Configuration Changes
Add these settings to `/etc/redis/redis.conf`:
```conf
# Security
requirepass your-secure-redis-password

# Memory management
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence (optional)
save 900 1
save 300 10
save 60 10000

# Network
bind 127.0.0.1
port 6379
```

### 3. Start Redis Service
```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server
sudo systemctl status redis-server
```

### 4. Update Environment Variables
Add to your `.env` file:
```env
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-secure-redis-password

# Sentry Error Monitoring (Production)
SENTRY_DSN=your-sentry-dsn-url

# Alert Configuration (Optional)
SLACK_WEBHOOK_URL=your-slack-webhook-url
DISCORD_WEBHOOK_URL=your-discord-webhook-url
ALERT_EMAIL=admin@yourcompany.com
```

### 5. Test Redis Connection
```bash
cd /path/to/BeigeBackEnd
node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.ping().then(() => {
  console.log('✅ Redis connected successfully');
  redis.disconnect();
}).catch(err => {
  console.log('❌ Redis connection failed:', err.message);
});
"
```

## 🧪 Test Suite Usage

### Jest Integration & Unit Tests

#### Run All Tests
```bash
cd /path/to/BeigeBackEnd
yarn test
```

#### Run Specific Test Categories
```bash
# Unit tests only
yarn test:unit

# Integration tests only
yarn test:integration

# Watch mode for development
yarn test:watch

# Coverage report
yarn coverage
```

#### Run Specific Test Files
```bash
# Test booking flows
yarn test tests/integration/booking-flow.test.js

# Test webhook processing
yarn test tests/integration/webhook-processing.test.js

# Test authentication integration
yarn test tests/integration/auth-booking.test.js
```

### Playwright E2E Tests

#### Setup E2E Tests
```bash
cd /path/to/BeigeBackEnd

# Make sure both backend and frontend are running
# Terminal 1: Start backend
yarn dev

# Terminal 2: Start frontend (from beige-web-v2 directory)
cd ../beige-web-v2
npm run dev

# Terminal 3: Run E2E tests
cd /path/to/BeigeBackEnd
yarn test:e2e
```

#### Run Specific E2E Tests
```bash
# Guest booking flow
yarn test:e2e tests/e2e/guest-booking.spec.js

# Authenticated user flow
yarn test:e2e tests/e2e/auth-booking.spec.js

# Dashboard functionality
yarn test:e2e tests/e2e/dashboard.spec.js

# Run in headed mode (visible browser)
yarn test:e2e --headed

# Run specific browser
yarn test:e2e --project=chromium
yarn test:e2e --project=firefox
yarn test:e2e --project=webkit
```

### Performance Tests

#### Load Testing with Autocannon
```bash
cd /path/to/BeigeBackEnd

# Run comprehensive performance tests
yarn test:performance

# Run specific performance test
node tests/performance/load-test.js

# Memory leak detection
node tests/performance/memory-leak-test.js
```

#### K6 Load Testing
```bash
# Install k6 (if not installed)
# Ubuntu/Debian:
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Run K6 tests
cd /path/to/BeigeBackEnd
k6 run tests/performance/k6-load-test.js

# Run with custom configuration
k6 run --vus 10 --duration 30s tests/performance/k6-load-test.js
```

## 🏥 Health Check Endpoints

### Basic Health Checks
```bash
# Basic health check
curl http://localhost:5001/api/v1/health

# Detailed health with dependencies
curl http://localhost:5001/api/v1/health/detailed

# Liveness probe (for Kubernetes)
curl http://localhost:5001/api/v1/health/live

# Readiness probe (for Kubernetes)
curl http://localhost:5001/api/v1/health/ready
```

### Specific Component Health
```bash
# Database health
curl http://localhost:5001/api/v1/health/database

# Cache health
curl http://localhost:5001/api/v1/health/cache

# Application health
curl http://localhost:5001/api/v1/health/application

# System metrics
curl http://localhost:5001/api/v1/health/metrics
```

### Automated Health Monitoring
```bash
cd /path/to/BeigeBackEnd

# Single health check run
node scripts/health-check.js

# Continuous monitoring (every 5 minutes)
node scripts/health-check.js --continuous --interval=5

# Export results as JSON
node scripts/health-check.js --format=json

# Export results as Prometheus metrics
node scripts/health-check.js --format=prometheus

# Check specific URL
node scripts/health-check.js --url=https://your-production-domain.com
```

## 📊 Analytics Endpoints

### Setup Authentication Token
First, you need an admin user token. Login with admin credentials:
```bash
# Login to get admin token
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@beige.app",
    "password": "your-admin-password"
  }'

# Copy the access token from the response
export ADMIN_TOKEN="your-jwt-token-here"
```

### Analytics API Calls
```bash
# Conversion funnel metrics (last 30 days)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/conversion?days=30"

# Booking trends (daily for last 7 days)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/trends?days=7&groupBy=day"

# Service type performance
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/services?days=30"

# User behavior metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/users?days=30"

# Revenue analytics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/revenue?days=30"

# Complete dashboard data
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/dashboard?days=30"

# Real-time metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/realtime"
```

### Export Analytics Data
```bash
# Export as JSON
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/export?days=30&format=json" \
  -o analytics-report.json

# Export as CSV
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/export?days=30&format=csv" \
  -o analytics-report.csv
```

### Clear Analytics Cache
```bash
# Clear all analytics cache
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/cache"

# Clear specific cache pattern
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/cache?pattern=analytics:conversion*"
```

## 🚨 Monitoring & Alerts

### Setup Monitoring Dashboard

#### Get Real-time Monitoring Metrics
```bash
# Get comprehensive monitoring data
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/metrics/realtime"

# Get alert metrics summary
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/alerts"

# Check monitoring service status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/status"
```

#### Test Alert System
```bash
# Send test alert
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "test_deployment", "severity": "warning"}' \
  "http://localhost:5001/api/v1/monitoring/alerts/test"

# Reset alert metrics (for testing)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/alerts/reset"
```

#### Export Monitoring Data
```bash
# Export as JSON
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/export?format=json" \
  -o monitoring-report.json

# Export as CSV
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/export?format=csv" \
  -o monitoring-report.csv
```

### Sentry Error Monitoring Setup

#### 1. Create Sentry Project
1. Go to https://sentry.io/ and create an account
2. Create a new project for Node.js
3. Copy the DSN URL

#### 2. Configure Sentry
```bash
# Add to your .env file
echo "SENTRY_DSN=your-sentry-dsn-here" >> .env

# Test Sentry integration
node -e "
const monitoringService = require('./src/services/monitoring.service');
monitoringService.initialize();
console.log('✅ Sentry monitoring initialized');
"
```

#### 3. Verify Error Tracking
```bash
# Trigger a test error (will be captured by Sentry)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/alerts/test" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "sentry_test", "severity": "critical"}'
```

### Alert Configuration

#### Slack Integration
```bash
# 1. Create Slack webhook
# Go to https://api.slack.com/messaging/webhooks
# Create webhook for your channel

# 2. Add webhook to environment
echo "SLACK_WEBHOOK_URL=your-slack-webhook-url" >> .env

# 3. Test Slack alerts
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "slack_test", "severity": "critical"}' \
  "http://localhost:5001/api/v1/monitoring/alerts/test"
```

#### Discord Integration
```bash
# 1. Create Discord webhook
# Go to your Discord server settings > Integrations > Webhooks

# 2. Add webhook to environment
echo "DISCORD_WEBHOOK_URL=your-discord-webhook-url" >> .env

# 3. Test Discord alerts
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "discord_test", "severity": "warning"}' \
  "http://localhost:5001/api/v1/monitoring/alerts/test"
```

## 🗄️ Database Migration

### Run Production Migration
```bash
cd /path/to/BeigeBackEnd

# Dry run (safe preview)
node scripts/migrate-orders.js

# Execute migration (PRODUCTION)
node scripts/migrate-orders.js --execute

# Rollback if needed
node scripts/migrate-orders.js --rollback
```

### Database Optimization
```bash
# Optimize database indexes and setup Redis caching
node scripts/optimize-database.js

# Check optimization results
node scripts/health-check.js
```

## 🚀 Production Startup Commands

### Start Application with All Services
```bash
cd /path/to/BeigeBackEnd

# Start Redis (if not running as service)
redis-server &

# Start the application
NODE_ENV=production yarn start

# Or with PM2 for production
pm2 start src/index.js --name "beige-backend" --env production
```

### Environment Variables Check
```bash
# Verify all required environment variables
cd /path/to/BeigeBackEnd
node -e "
const requiredVars = ['MONGODB_URL', 'JWT_SECRET', 'STRIPE_SECRET_KEY', 'REDIS_URL'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length) {
  console.log('❌ Missing environment variables:', missing);
} else {
  console.log('✅ All required environment variables are set');
}
"
```

## 🔧 Troubleshooting

### Common Issues

#### Redis Connection Issues
```bash
# Check Redis status
sudo systemctl status redis-server

# Check Redis logs
sudo journalctl -u redis-server -f

# Test Redis manually
redis-cli ping
```

#### Test Failures
```bash
# Run tests with verbose output
yarn test --verbose

# Check test environment
NODE_ENV=test yarn test

# Clear test cache
yarn test --clearCache
```

#### Performance Issues
```bash
# Check system resources
htop
df -h
free -m

# Monitor application performance
node scripts/health-check.js --continuous
```

### Log Files Locations
```bash
# Application logs
tail -f logs/app.log

# Redis logs
sudo tail -f /var/log/redis/redis-server.log

# System logs
sudo journalctl -f
```

## 📈 Monitoring Setup

### Production Monitoring
```bash
# Setup continuous health monitoring
cd /path/to/BeigeBackEnd

# Create monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash
while true; do
  node scripts/health-check.js >> /var/log/beige-health.log 2>&1
  sleep 300  # Check every 5 minutes
done
EOF

chmod +x monitor.sh

# Run with nohup for background monitoring
nohup ./monitor.sh &
```

### Performance Monitoring
```bash
# Setup performance monitoring
cat > performance-monitor.sh << 'EOF'
#!/bin/bash
while true; do
  node tests/performance/load-test.js >> /var/log/beige-performance.log 2>&1
  sleep 3600  # Check every hour
done
EOF

chmod +x performance-monitor.sh
nohup ./performance-monitor.sh &
```

## 🔄 CI/CD Pipeline

### GitHub Actions Setup

This project includes a complete CI/CD pipeline with GitHub Actions:

#### Pipeline Features
- ✅ Lint and code quality checks
- ✅ Unit, integration, and E2E tests
- ✅ Performance testing
- ✅ Security scanning
- ✅ Docker build and health checks
- ✅ Automated deployment to staging/production

#### Setup CI/CD
```bash
# 1. Push your code to GitHub
git add .
git commit -m "Production-ready deployment"
git push origin main

# 2. Configure GitHub secrets (Repository Settings > Secrets)
# Add these secrets:
# - MONGODB_URL
# - JWT_SECRET
# - STRIPE_SECRET_KEY
# - SENTRY_DSN
# - SLACK_WEBHOOK_URL (optional)
# - DISCORD_WEBHOOK_URL (optional)

# 3. The pipeline will automatically run on push to main/develop branches
```

#### Manual Pipeline Trigger
```bash
# Trigger via GitHub CLI
gh workflow run ci-cd.yml

# Or push a tag for release
git tag v1.0.0
git push origin v1.0.0
```

### Docker Deployment

#### Production Docker Setup
```bash
cd /path/to/BeigeBackEnd

# 1. Build production image
docker build -t beige-backend:production .

# 2. Run with docker-compose
docker-compose -f docker-compose.prod.yml up -d

# 3. Check container health
docker ps
docker logs beige-backend-container
```

#### Container Health Monitoring
```bash
# Check all service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Health check specific container
docker exec beige-backend-container curl -f http://localhost:5001/api/v1/health
```

## ✅ Production Validation

### Automated Production Readiness Check
```bash
cd /path/to/BeigeBackEnd

# Run comprehensive validation
yarn validate:production

# This will check:
# ✅ All dependencies installed
# ✅ Test suite complete
# ✅ Health check system
# ✅ Monitoring and alerts
# ✅ Analytics system
# ✅ Database optimization
# ✅ Docker configuration
# ✅ CI/CD pipeline
# ✅ Documentation
# ✅ Security configuration
```

### Manual Production Checklist

Before going live, run these commands to verify everything:

```bash
cd /path/to/BeigeBackEnd

# 1. Install dependencies
yarn install

# 2. Run production validation
yarn validate:production

# 3. Run all tests
yarn test:all

# 4. Check health endpoints
node scripts/health-check.js

# 5. Verify database migration
node scripts/migrate-orders.js

# 6. Test analytics endpoints
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/dashboard"

# 7. Test monitoring endpoints
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/alerts"

# 8. Performance test
yarn test:performance

# 9. Check environment variables
node -e "console.log('Node ENV:', process.env.NODE_ENV)"

# 10. Test Sentry integration
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "production_deployment", "severity": "info"}' \
  "http://localhost:5001/api/v1/monitoring/alerts/test"
```

### Production Deployment Steps

#### Digital Ocean Deployment
```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Clone/update repository
git clone https://github.com/your-username/BeigeBackEnd.git
cd BeigeBackEnd

# 3. Install dependencies
yarn install

# 4. Configure environment variables
cp .env.example .env
nano .env  # Configure all production values

# 5. Run production validation
yarn validate:production

# 6. Setup database and Redis (as per guide above)

# 7. Run database migration
yarn migrate:orders --execute

# 8. Start with PM2
pm2 start src/index.js --name "beige-backend" --env production

# 9. Setup monitoring
pm2 startup
pm2 save

# 10. Configure Nginx (optional)
# Setup reverse proxy and SSL certificates
```

## 🆘 Emergency Commands

### Quick Health Check
```bash
curl -f http://localhost:5001/api/v1/health || echo "❌ API Down"
```

### Clear All Caches
```bash
# Clear Redis cache
redis-cli FLUSHALL

# Restart application
pm2 restart beige-backend
```

### View Real-time Logs
```bash
# Application logs
pm2 logs beige-backend --lines 100

# Health check logs
tail -f /var/log/beige-health.log
```

---

## 📞 Support

If you encounter issues:

1. Check the health endpoints: `curl http://localhost:5001/api/v1/health/detailed`
2. Review application logs: `pm2 logs beige-backend`
3. Verify Redis connection: `redis-cli ping`
4. Run diagnostics: `node scripts/health-check.js`

All commands above assume you're running from the BeigeBackEnd directory unless otherwise specified.