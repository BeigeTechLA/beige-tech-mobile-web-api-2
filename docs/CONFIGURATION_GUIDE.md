# Configuration Guide for New Dependencies

This guide explains how to set up and configure Redis, Docker, and Sentry for the enhanced production features.

## 📋 Overview

The new production-ready features include:
- **Redis**: Caching layer for performance optimization
- **Docker**: Containerization for consistent deployments
- **Sentry**: Error monitoring and performance tracking
- **Alert System**: Real-time monitoring and notifications

**Important**: All these features are **optional** and your app will work perfectly without them. They provide enhanced performance, monitoring, and deployment capabilities.

## 🔧 Redis Configuration

Redis provides caching for analytics, improved performance, and session management.

### Local Development Setup

#### Option 1: Install Redis Locally (macOS)
```bash
# Install Redis via Homebrew
brew install redis

# Start Redis service
brew services start redis

# Test Redis connection
redis-cli ping
# Should return: PONG
```

#### Option 2: Install Redis Locally (Ubuntu/Linux)
```bash
# Update packages
sudo apt update

# Install Redis
sudo apt install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG
```

#### Option 3: Docker Redis (Cross-platform)
```bash
# Run Redis in Docker
docker run -d --name redis-beige -p 6379:6379 redis:7.0-alpine

# Test connection
docker exec -it redis-beige redis-cli ping
# Should return: PONG
```

### Environment Configuration

Add to your `.env` file:
```env
# Redis Configuration (Local Development)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# For password-protected Redis
# REDIS_PASSWORD=your-secure-password
```

### Production Redis Setup (Digital Ocean)

```bash
# SSH into your server
ssh root@your-server-ip

# Install Redis
sudo apt update
sudo apt install redis-server

# Configure Redis for production
sudo nano /etc/redis/redis.conf

# Add these settings:
# Security
requirepass your-secure-redis-password

# Memory management
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Network (local only for security)
bind 127.0.0.1
port 6379

# Start Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

Production `.env` settings:
```env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-secure-redis-password
```

### Testing Redis Integration

```bash
# Test Redis connection from your app
node -e "
const cacheService = require('./src/services/cache.service');
(async () => {
  try {
    await cacheService.set('test', 'hello', 60);
    const result = await cacheService.get('test');
    console.log('✅ Redis working:', result);
  } catch (error) {
    console.log('ℹ️ Redis not available, app will use fallback caching');
  }
})();
"
```

## 🐳 Docker Configuration

Docker enables consistent deployments across different environments.

### Install Docker

#### macOS
```bash
# Download Docker Desktop from https://www.docker.com/products/docker-desktop/
# Or install via Homebrew
brew install --cask docker
```

#### Ubuntu/Linux
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Restart to apply group changes
sudo systemctl restart docker
```

### Docker Development Setup

The project includes Docker configurations for different environments:

#### Development with Docker
```bash
# Build and run development environment
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Production with Docker
```bash
# Build production image
docker build -t beige-backend:production .

# Run production stack
docker-compose -f docker-compose.prod.yml up -d

# Check container health
docker ps
docker logs beige-backend-backend-1
```

### Docker Environment Variables

Create a `.env.docker` file for Docker-specific settings:
```env
NODE_ENV=production
PORT=5001
MONGODB_URL=mongodb://mongo:27017/beige-prod
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=docker-redis-password
JWT_SECRET=your-production-jwt-secret
STRIPE_SECRET_KEY=your-stripe-key
SENTRY_DSN=your-sentry-dsn
```

### Useful Docker Commands

```bash
# View running containers
docker ps

# Check container logs
docker logs container-name

# Access container shell
docker exec -it container-name /bin/sh

# View container resource usage
docker stats

# Clean up unused images/containers
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache
```

## 🚨 Sentry Configuration

Sentry provides error tracking, performance monitoring, and alerting for production applications.

### Create Sentry Account and Project

1. **Sign up at Sentry**
   - Go to https://sentry.io/
   - Create a free account (generous free tier)
   - Create a new project
   - Select "Node.js" as the platform

2. **Get Your DSN**
   - After creating the project, copy the DSN URL
   - It looks like: `https://abc123@o123456.ingest.sentry.io/123456`

### Environment Configuration

Add to your `.env` file:
```env
# Sentry Error Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Optional: Environment tagging
SENTRY_ENVIRONMENT=development
# For production: SENTRY_ENVIRONMENT=production
```

### Testing Sentry Integration

```bash
# Test Sentry error capture
node -e "
const monitoringService = require('./src/services/monitoring.service');
monitoringService.initialize();

// Simulate an error (will appear in Sentry dashboard)
setTimeout(() => {
  monitoringService.captureError(new Error('Test error from configuration'), {
    context: 'configuration_test',
    user: 'test-user'
  });
  console.log('✅ Test error sent to Sentry (check your dashboard)');
}, 1000);
"
```

### Sentry Dashboard Usage

After configuration, you can:
- **View Errors**: See all application errors in real-time
- **Performance Monitoring**: Track slow API endpoints
- **Release Tracking**: Monitor deployments and their impact
- **Alerts**: Get notified of error spikes or new issues

### Sentry Best Practices

```bash
# Set release version for better tracking
export SENTRY_RELEASE=$(git rev-parse HEAD)

# Tag environments appropriately
# development, staging, production
```

## 🔔 Alert System Configuration

The alert system provides real-time notifications for critical issues.

### Slack Integration

1. **Create Slack App**
   - Go to https://api.slack.com/apps
   - Create a new app
   - Add "Incoming Webhooks" feature
   - Create webhook for your channel

2. **Configure Webhook**
```env
# Add to .env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

3. **Test Slack Alerts**
```bash
# Test Slack notification
curl -X POST -H "Content-Type: application/json" \
  -d '{"text": "🎉 Beige Backend alert system configured successfully!"}' \
  $SLACK_WEBHOOK_URL
```

### Discord Integration

1. **Create Discord Webhook**
   - Go to your Discord server
   - Server Settings → Integrations → Webhooks
   - Create webhook and copy URL

2. **Configure Webhook**
```env
# Add to .env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK
```

### Email Alerts (Optional)

For critical alerts, you can configure email notifications:
```env
# Email configuration (if using SendGrid)
SENDGRID_API_KEY=your-sendgrid-key
ALERT_EMAIL=admin@yourcompany.com
```

## 🧪 Testing All Configurations

Run this comprehensive test to verify all services:

```bash
# Test all configurations
node -e "
const tests = [
  // Test Redis
  async () => {
    try {
      const cacheService = require('./src/services/cache.service');
      await cacheService.set('config-test', 'ok', 10);
      const result = await cacheService.get('config-test');
      return result === 'ok' ? '✅ Redis: Working' : '⚠️ Redis: Issue';
    } catch (e) {
      return 'ℹ️ Redis: Not configured (optional)';
    }
  },

  // Test Sentry
  async () => {
    try {
      const monitoring = require('./src/services/monitoring.service');
      monitoring.initialize();
      return monitoring.isInitialized ? '✅ Sentry: Working' : 'ℹ️ Sentry: Not configured (optional)';
    } catch (e) {
      return 'ℹ️ Sentry: Not configured (optional)';
    }
  },

  // Test Database
  async () => {
    try {
      const mongoose = require('mongoose');
      return mongoose.connection.readyState === 1 ? '✅ MongoDB: Connected' : '⚠️ MongoDB: Disconnected';
    } catch (e) {
      return '❌ MongoDB: Error';
    }
  }
];

(async () => {
  console.log('🔍 Configuration Test Results:');
  for (const test of tests) {
    console.log(await test());
  }
})();
"
```

## 🚦 Configuration Status Check

You can check which services are configured:

```bash
# Check configuration status
curl http://localhost:5001/api/v1/monitoring/status

# Expected response shows status of all services:
# {
#   "monitoring": { "status": "healthy/disabled" },
#   "alerts": { "status": "healthy" },
#   "cache": { "status": "healthy/disabled" }
# }
```

## 🔧 Troubleshooting

### Redis Issues
```bash
# Check if Redis is running
redis-cli ping

# Check Redis logs
sudo journalctl -u redis-server -f

# Reset Redis data
redis-cli FLUSHALL
```

### Docker Issues
```bash
# Check Docker service
sudo systemctl status docker

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up
```

### Sentry Issues
```bash
# Verify DSN format
echo $SENTRY_DSN

# Check Sentry project settings
# Ensure DSN is active and project exists
```

## 📝 Configuration Checklist

- [ ] Redis installed and running
- [ ] Redis environment variables configured
- [ ] Docker installed (if using containerization)
- [ ] Sentry account created and DSN configured
- [ ] Alert webhooks configured (optional)
- [ ] All services tested with status endpoint
- [ ] Configuration documented for team

Remember: **All configurations are optional**. Your app will work perfectly with just the basic MongoDB setup you already have!