# Testing Guide

This comprehensive guide explains how to use the complete test suite including Jest unit/integration tests, Playwright E2E tests, and performance testing.

## 📋 Test Suite Overview

The testing infrastructure includes:
- **Unit Tests**: Individual function and component testing
- **Integration Tests**: API endpoint and service integration testing
- **E2E Tests**: Full user journey testing with Playwright
- **Performance Tests**: Load testing and performance benchmarking

## 🚀 Quick Start

```bash
# Install all dependencies
yarn install

# Install Playwright browsers (for E2E tests)
yarn playwright:install

# Run all tests
yarn test:all
```

## 🧪 Jest Unit & Integration Tests

### Available Test Commands

```bash
# Run all Jest tests (unit + integration)
yarn test

# Run only unit tests
yarn test:unit

# Run only integration tests
yarn test:integration

# Watch mode for development
yarn test:watch

# Generate coverage report
yarn coverage

# Run tests with verbose output
yarn test --verbose

# Run specific test file
yarn test tests/integration/booking-flow.test.js

# Run tests matching pattern
yarn test --testNamePattern="booking creation"
```

### Test Structure

```
tests/
├── unit/                    # Unit tests (isolated functions)
├── integration/             # Integration tests (API endpoints)
│   ├── booking-flow.test.js       # Booking workflow tests
│   ├── webhook-processing.test.js # Stripe webhook tests
│   └── auth-booking.test.js       # Authentication integration
└── performance/             # Performance tests
```

### Key Integration Tests

#### 1. Booking Flow Tests (`tests/integration/booking-flow.test.js`)

Tests the complete booking creation and processing workflow:

```bash
# Run booking flow tests
yarn test tests/integration/booking-flow.test.js

# Test scenarios included:
# ✅ Guest booking creation
# ✅ Authenticated user booking
# ✅ Payment intent creation
# ✅ Booking validation
# ✅ Error handling
# ✅ Airtable sync (if configured)
```

#### 2. Webhook Processing Tests (`tests/integration/webhook-processing.test.js`)

Tests Stripe webhook handling and payment processing:

```bash
# Run webhook tests
yarn test tests/integration/webhook-processing.test.js

# Test scenarios:
# ✅ Payment success webhooks
# ✅ Payment failure handling
# ✅ Idempotency (duplicate webhook handling)
# ✅ Invalid webhook signatures
# ✅ Order conversion process
```

#### 3. Auth Integration Tests (`tests/integration/auth-booking.test.js`)

Tests authentication integration with booking system:

```bash
# Run auth integration tests
yarn test tests/integration/auth-booking.test.js

# Test scenarios:
# ✅ User registration during checkout
# ✅ Booking claiming by authenticated users
# ✅ JWT token validation
# ✅ Role-based access control
```

### Test Configuration

The test setup includes:
- **In-memory MongoDB**: No need for separate test database
- **Mocked external services**: Stripe, email, Airtable
- **Isolated test environment**: Each test runs independently
- **Comprehensive fixtures**: Pre-built test data

### Writing Custom Tests

#### Example Unit Test
```javascript
// tests/unit/utils.test.js
const { calculateBookingTotal } = require('../../src/utils/booking');

describe('Booking Utils', () => {
  test('should calculate total correctly', () => {
    const booking = {
      basePrice: 100,
      addOns: [{ price: 25 }, { price: 15 }]
    };

    const total = calculateBookingTotal(booking);
    expect(total).toBe(140);
  });
});
```

#### Example Integration Test
```javascript
// tests/integration/my-endpoint.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('My Endpoint', () => {
  test('should create resource', async () => {
    const response = await request(app)
      .post('/api/v1/my-endpoint')
      .send({ name: 'Test Resource' })
      .expect(201);

    expect(response.body.data.name).toBe('Test Resource');
  });
});
```

## 🎭 Playwright E2E Tests

End-to-end tests simulate real user interactions in browsers.

### Available E2E Commands

```bash
# Run all E2E tests
yarn test:e2e

# Run specific E2E test
yarn test:e2e tests/e2e/guest-booking.spec.js

# Run E2E tests in headed mode (visible browser)
yarn test:e2e --headed

# Run in specific browser
yarn test:e2e --project=chromium
yarn test:e2e --project=firefox
yarn test:e2e --project=webkit

# Run with debug mode
yarn test:e2e --debug

# Generate E2E test report
yarn test:e2e --reporter=html
```

### E2E Test Structure

```
tests/e2e/
├── guest-booking.spec.js     # Guest user booking flow
├── auth-booking.spec.js      # Authenticated user flow
└── dashboard.spec.js         # Dashboard management tests
```

### Key E2E Test Scenarios

#### 1. Guest Booking Flow (`tests/e2e/guest-booking.spec.js`)

Tests complete guest booking journey:

```bash
yarn test:e2e tests/e2e/guest-booking.spec.js

# Test scenarios:
# ✅ Service selection
# ✅ Date/time booking
# ✅ Guest information form
# ✅ Payment processing
# ✅ Booking confirmation
# ✅ Mobile responsiveness
# ✅ Network interruption handling
```

#### 2. Authenticated User Flow (`tests/e2e/auth-booking.spec.js`)

Tests logged-in user booking experience:

```bash
yarn test:e2e tests/e2e/auth-booking.spec.js

# Test scenarios:
# ✅ User login
# ✅ Pre-filled user information
# ✅ Faster checkout process
# ✅ Booking history access
# ✅ Account management
```

#### 3. Dashboard Tests (`tests/e2e/dashboard.spec.js`)

Tests admin/user dashboard functionality:

```bash
yarn test:e2e tests/e2e/dashboard.spec.js

# Test scenarios:
# ✅ Dashboard navigation
# ✅ Booking management
# ✅ Order filtering
# ✅ Payment history
# ✅ User account management
```

### E2E Test Setup Requirements

Before running E2E tests, ensure:

```bash
# 1. Backend server is running
yarn dev  # Terminal 1

# 2. Frontend is running (if testing full stack)
cd ../beige-web-v2
npm run dev  # Terminal 2

# 3. Run E2E tests
cd ../BeigeBackEnd
yarn test:e2e  # Terminal 3
```

### E2E Configuration

Playwright configuration (`playwright.config.js`):
- **Multiple browsers**: Chrome, Firefox, Safari
- **Mobile testing**: iPhone, Android viewports
- **Screenshots**: On failure
- **Video recording**: For debugging
- **Retry logic**: Automatic retries for flaky tests

### Debugging E2E Tests

```bash
# Run with visible browser
yarn test:e2e --headed

# Run with debug console
yarn test:e2e --debug

# Run single test with trace
yarn test:e2e tests/e2e/guest-booking.spec.js --trace on

# View test report
npx playwright show-report
```

## ⚡ Performance Tests

Load testing and performance benchmarking to ensure scalability.

### Available Performance Commands

```bash
# Run all performance tests
yarn test:performance

# Run specific performance test
node tests/performance/load-test.js

# Run memory leak detection
node tests/performance/memory-leak-test.js

# Continuous performance monitoring
node tests/performance/load-test.js --continuous
```

### Performance Test Types

#### 1. Load Testing (`tests/performance/load-test.js`)

Tests API performance under load:

```bash
node tests/performance/load-test.js

# Tests include:
# 🚀 Concurrent booking creation
# 🚀 Authentication endpoints
# 🚀 Health check performance
# 🚀 Database query optimization
# 🚀 Cache effectiveness
```

#### 2. Memory Leak Detection

Monitors memory usage over time:

```bash
node tests/performance/memory-leak-test.js

# Monitors:
# 📊 Memory heap usage
# 📊 Garbage collection patterns
# 📊 Memory leak detection
# 📊 Resource cleanup verification
```

### Performance Benchmarks

Expected performance targets:
- **API Response Time**: < 200ms (95th percentile)
- **Booking Creation**: < 500ms average
- **Database Queries**: < 100ms average
- **Concurrent Users**: 100+ simultaneous
- **Memory Usage**: Stable under load

### K6 Load Testing (Advanced)

For more advanced load testing:

```bash
# Install K6 (macOS)
brew install k6

# Install K6 (Ubuntu)
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Run K6 load tests
k6 run tests/performance/k6-load-test.js

# Custom load test
k6 run --vus 50 --duration 30s tests/performance/k6-load-test.js
```

## 📊 Test Coverage

### Coverage Reports

```bash
# Generate coverage report
yarn coverage

# Coverage with specific threshold
yarn coverage --coverageThreshold='{"global":{"branches":80,"functions":85,"lines":90,"statements":90}}'

# View coverage in browser
open coverage/lcov-report/index.html
```

### Coverage Targets

Current coverage requirements:
- **Branches**: 80%
- **Functions**: 85%
- **Lines**: 90%
- **Statements**: 90%

### Improving Coverage

```bash
# Find uncovered code
yarn coverage --coverage

# Run coverage with verbose output
yarn coverage --verbose

# Test specific uncovered files
yarn test src/services/my-service.js --coverage
```

## 🛠️ Test Development Workflow

### 1. Test-Driven Development (TDD)

```bash
# 1. Write failing test
yarn test:watch  # Keep running in background

# 2. Write minimal code to pass test
# 3. Refactor and improve
# 4. Repeat
```

### 2. Integration Test Development

```bash
# 1. Start test environment
yarn test:integration --watch

# 2. Develop API endpoint
# 3. Write comprehensive integration test
# 4. Verify edge cases and error handling
```

### 3. E2E Test Development

```bash
# 1. Start servers
yarn dev  # Backend
npm run dev  # Frontend (in separate terminal)

# 2. Develop E2E test with visual browser
yarn test:e2e --headed --debug

# 3. Record test interactions
# 4. Add assertions and validations
```

## 🚨 Continuous Integration

### GitHub Actions Integration

The test suite integrates with CI/CD:

```yaml
# .github/workflows/ci-cd.yml automatically runs:
- Lint and code quality checks
- Unit and integration tests
- E2E tests with browser matrix
- Performance benchmarks
- Coverage reporting
```

### Local CI Simulation

```bash
# Run full CI test suite locally
yarn test:all

# This runs:
# 1. ESLint
# 2. Prettier
# 3. Unit tests
# 4. Integration tests
# 5. E2E tests
# 6. Performance tests
# 7. Coverage reporting
```

## 🔧 Troubleshooting Tests

### Common Issues

#### Jest Test Issues
```bash
# Clear Jest cache
yarn test --clearCache

# Run with verbose logging
yarn test --verbose --no-cache

# Debug specific test
yarn test --testNamePattern="my failing test" --verbose
```

#### Playwright Issues
```bash
# Update browsers
yarn playwright:install

# Clear browser cache
rm -rf ~/.cache/ms-playwright

# Debug with trace
yarn test:e2e --trace on
```

#### Performance Test Issues
```bash
# Check system resources
htop  # or top on macOS

# Monitor database performance
# Check MongoDB slow query log

# Verify Redis connection
redis-cli ping
```

### Test Environment Issues

```bash
# Reset test database
# (Automatic with in-memory MongoDB)

# Check test ports
lsof -i :5001  # Backend test port

# Verify environment variables
echo $NODE_ENV  # Should be 'test'
```

## 📝 Testing Best Practices

### 1. Test Naming
```javascript
// ✅ Good: Descriptive test names
describe('Booking Service', () => {
  test('should create booking with valid guest information', () => {});
  test('should reject booking with missing email', () => {});
});

// ❌ Bad: Vague test names
describe('Booking', () => {
  test('works', () => {});
});
```

### 2. Test Independence
```javascript
// ✅ Good: Independent tests
beforeEach(() => {
  // Fresh setup for each test
});

// ❌ Bad: Tests depend on each other
let sharedBookingId; // Don't do this
```

### 3. Meaningful Assertions
```javascript
// ✅ Good: Specific assertions
expect(response.body.data.booking.status).toBe('pending');
expect(response.body.data.booking.totalAmount).toBe(150);

// ❌ Bad: Generic assertions
expect(response.body).toBeTruthy();
```

## 🎯 Testing Checklist

Before deploying:
- [ ] All unit tests pass
- [ ] Integration tests cover API endpoints
- [ ] E2E tests cover critical user journeys
- [ ] Performance tests meet benchmarks
- [ ] Coverage meets minimum thresholds
- [ ] Tests run successfully in CI/CD
- [ ] Manual testing completed for new features

The comprehensive test suite ensures your application is robust, reliable, and ready for production! 🚀