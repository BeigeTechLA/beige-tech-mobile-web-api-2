# API Usage Guide: Analytics, Health Checks & Monitoring

This guide explains how to use the analytics, health check, and monitoring endpoints for production observability and business insights.

## 📋 Overview

The production-ready API includes three main monitoring systems:

1. **Analytics API** (`/api/v1/analytics/*`) - Business metrics and insights
2. **Health Check API** (`/api/v1/health/*`) - System health and readiness
3. **Monitoring API** (`/api/v1/monitoring/*`) - Real-time monitoring and alerts

**Important**: These endpoints provide visibility into your application's health and performance. They're designed to work seamlessly with or without Redis/Sentry configuration.

## 📊 Analytics API

The Analytics API provides comprehensive business metrics about bookings, revenue, user behavior, and service performance.

### Authentication

All analytics endpoints require admin authentication:

```bash
# Get admin token first
export ADMIN_TOKEN="your-admin-jwt-token"

# Or use in requests
curl -H "Authorization: Bearer your-admin-jwt-token" \
  http://localhost:5001/api/v1/analytics/dashboard
```

### Available Analytics Endpoints

#### 1. Dashboard Analytics

Get comprehensive overview of all business metrics.

**Endpoint**: `GET /api/v1/analytics/dashboard`

**Query Parameters**:
- `days` (optional): Number of days to analyze (default: 30)

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/dashboard?days=30"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalBookings": 145,
      "totalRevenue": 28750.00,
      "conversionRate": 68.5,
      "avgBookingValue": 198.28
    },
    "conversion": {
      "totalBookings": 145,
      "guestBookings": 89,
      "authenticatedBookings": 56,
      "completedOrders": 99,
      "cancelledBookings": 12,
      "conversionRate": 68.5,
      "dateRange": {
        "startDate": "2025-03-01T00:00:00.000Z",
        "endDate": "2025-03-31T00:00:00.000Z",
        "days": 30
      }
    },
    "trends": [...],
    "services": [...],
    "users": {...},
    "revenue": {...}
  }
}
```

**Use Cases**:
- Daily business performance review
- Executive dashboards
- Monthly reporting
- Performance tracking

---

#### 2. Conversion Funnel Metrics

Analyze booking conversion rates and funnel performance.

**Endpoint**: `GET /api/v1/analytics/conversion`

**Query Parameters**:
- `days` (optional): Analysis period (default: 30)

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/conversion?days=7"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "totalBookings": 45,
    "guestBookings": 28,
    "authenticatedBookings": 17,
    "completedOrders": 31,
    "cancelledBookings": 3,
    "conversionRate": 68.89,
    "dateRange": {
      "startDate": "2025-03-24T00:00:00.000Z",
      "endDate": "2025-03-31T00:00:00.000Z",
      "days": 7
    }
  }
}
```

**Key Metrics Explained**:
- `totalBookings`: All booking attempts
- `guestBookings`: Bookings from non-authenticated users
- `authenticatedBookings`: Bookings from logged-in users
- `completedOrders`: Successfully completed bookings
- `conversionRate`: (completedOrders / totalBookings) × 100

---

#### 3. Booking Trends

View booking trends over time with customizable grouping.

**Endpoint**: `GET /api/v1/analytics/trends`

**Query Parameters**:
- `days` (optional): Analysis period (default: 30)
- `groupBy` (optional): Grouping interval - `hour`, `day`, `week`, `month` (default: `day`)

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/trends?days=7&groupBy=day"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "trends": [
      {
        "date": "2025-03-25",
        "bookings": 8,
        "totalAmount": 1600.00,
        "avgAmount": 200.00
      },
      {
        "date": "2025-03-26",
        "bookings": 12,
        "totalAmount": 2340.00,
        "avgAmount": 195.00
      }
    ],
    "groupBy": "day",
    "dateRange": {
      "startDate": "2025-03-24T00:00:00.000Z",
      "endDate": "2025-03-31T00:00:00.000Z",
      "days": 7
    }
  }
}
```

**Use Cases**:
- Identify peak booking times
- Weekly/monthly trend analysis
- Capacity planning
- Marketing campaign effectiveness

---

#### 4. Service Type Analytics

Analyze performance by service type.

**Endpoint**: `GET /api/v1/analytics/services`

**Query Parameters**:
- `days` (optional): Analysis period (default: 30)

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/services?days=30"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "services": [
      {
        "serviceType": "Photography",
        "bookings": 89,
        "totalRevenue": 17800.00,
        "avgBookingValue": 200.00
      },
      {
        "serviceType": "Videography",
        "bookings": 56,
        "totalRevenue": 16800.00,
        "avgBookingValue": 300.00
      }
    ],
    "dateRange": {
      "startDate": "2025-03-01T00:00:00.000Z",
      "endDate": "2025-03-31T00:00:00.000Z",
      "days": 30
    }
  }
}
```

**Use Cases**:
- Service popularity analysis
- Revenue by service type
- Pricing optimization
- Resource allocation

---

#### 5. User Behavior Metrics

Analyze user engagement and retention.

**Endpoint**: `GET /api/v1/analytics/users`

**Query Parameters**:
- `days` (optional): Analysis period (default: 30)

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/users?days=30"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "newUsers": 48,
    "activeUsers": 127,
    "repeatCustomers": 23,
    "userRetentionRate": 47.92,
    "dateRange": {
      "startDate": "2025-03-01T00:00:00.000Z",
      "endDate": "2025-03-31T00:00:00.000Z",
      "days": 30
    }
  }
}
```

**Key Metrics Explained**:
- `newUsers`: Users registered in period
- `activeUsers`: Users with recent activity
- `repeatCustomers`: Users with multiple bookings
- `userRetentionRate`: Percentage of users who return

---

#### 6. Revenue Analytics

Detailed revenue and financial metrics.

**Endpoint**: `GET /api/v1/analytics/revenue`

**Query Parameters**:
- `days` (optional): Analysis period (default: 30)

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/revenue?days=30"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "totalRevenue": 28750.00,
    "avgBookingValue": 198.28,
    "totalBookings": 145,
    "minBookingValue": 50.00,
    "maxBookingValue": 800.00,
    "dateRange": {
      "startDate": "2025-03-01T00:00:00.000Z",
      "endDate": "2025-03-31T00:00:00.000Z",
      "days": 30
    }
  }
}
```

---

#### 7. Real-time Metrics

Get current system activity and metrics.

**Endpoint**: `GET /api/v1/analytics/realtime`

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/realtime"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "bookingsLast24h": 12,
    "bookingsLastHour": 2,
    "activeUsersLastHour": 5,
    "timestamp": "2025-03-31T14:30:00.000Z"
  }
}
```

**Use Cases**:
- Live dashboard monitoring
- Real-time performance tracking
- Immediate issue detection

---

#### 8. Export Analytics Data

Export analytics data for external analysis.

**Endpoint**: `GET /api/v1/analytics/export`

**Query Parameters**:
- `days` (optional): Analysis period (default: 30)
- `format` (optional): Export format - `json` or `csv` (default: `json`)

**Example Request (JSON)**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/export?days=30&format=json" \
  -o analytics-report.json
```

**Example Request (CSV)**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/export?days=30&format=csv" \
  -o analytics-report.csv
```

**Use Cases**:
- Monthly reporting
- Data warehouse integration
- Excel analysis
- Custom dashboards

---

#### 9. Clear Analytics Cache

Clear cached analytics data (admin only).

**Endpoint**: `DELETE /api/v1/analytics/cache`

**Query Parameters**:
- `pattern` (optional): Cache key pattern to clear

**Example Request**:
```bash
# Clear all analytics cache
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/cache"

# Clear specific cache pattern
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/cache?pattern=conversion"
```

## 🏥 Health Check API

Health check endpoints for monitoring system status and readiness.

### Available Health Check Endpoints

#### 1. Basic Health Check

Quick health status check.

**Endpoint**: `GET /api/v1/health`

**No authentication required**

**Example Request**:
```bash
curl http://localhost:5001/api/v1/health
```

**Example Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-03-31T14:30:00.000Z",
  "uptime": 86400,
  "environment": "production"
}
```

**Use Cases**:
- Load balancer health checks
- Quick status verification
- Uptime monitoring

---

#### 2. Detailed Health Check

Comprehensive health status with dependency checks.

**Endpoint**: `GET /api/v1/health/detailed`

**Example Request**:
```bash
curl http://localhost:5001/api/v1/health/detailed
```

**Example Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-03-31T14:30:00.000Z",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 12
    },
    "cache": {
      "status": "healthy",
      "responseTime": 3
    },
    "stripe": {
      "status": "healthy",
      "responseTime": 45
    }
  },
  "system": {
    "memory": {
      "used": 245760000,
      "total": 536870912,
      "percentage": 45.8
    },
    "cpu": {
      "user": 120000,
      "system": 45000
    }
  }
}
```

**Status Values**:
- `healthy`: All systems operational
- `degraded`: Some non-critical issues
- `unhealthy`: Critical issues detected

---

#### 3. Liveness Probe

Kubernetes/Docker liveness check.

**Endpoint**: `GET /api/v1/health/live`

**Example Request**:
```bash
curl http://localhost:5001/api/v1/health/live
```

**Example Response**:
```json
{
  "status": "live",
  "timestamp": "2025-03-31T14:30:00.000Z"
}
```

**Use Cases**:
- Kubernetes liveness probe
- Docker health check
- Container orchestration

---

#### 4. Readiness Probe

Kubernetes/Docker readiness check.

**Endpoint**: `GET /api/v1/health/ready`

**Example Request**:
```bash
curl http://localhost:5001/api/v1/health/ready
```

**Example Response**:
```json
{
  "status": "ready",
  "timestamp": "2025-03-31T14:30:00.000Z",
  "dependencies": {
    "database": "connected",
    "cache": "connected"
  }
}
```

**Use Cases**:
- Kubernetes readiness probe
- Load balancer routing decisions
- Zero-downtime deployments

---

#### 5. System Metrics

Detailed system performance metrics.

**Endpoint**: `GET /api/v1/health/metrics`

**Example Request**:
```bash
curl http://localhost:5001/api/v1/health/metrics
```

**Example Response**:
```json
{
  "timestamp": "2025-03-31T14:30:00.000Z",
  "uptime": 86400,
  "memory": {
    "rss": 125829120,
    "heapTotal": 83845120,
    "heapUsed": 62914560,
    "external": 1842688
  },
  "cpu": {
    "user": 120000,
    "system": 45000
  },
  "eventLoop": {
    "delay": 2.5
  }
}
```

## 🚨 Monitoring API

Real-time monitoring, alerts, and system observability.

### Available Monitoring Endpoints

#### 1. Alert Metrics Summary

Get current alert metrics and thresholds.

**Endpoint**: `GET /api/v1/monitoring/alerts`

**Authentication**: Admin required

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/alerts"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "metrics": {
      "errors": {
        "total": 12,
        "bySeverity": {
          "critical": 2,
          "high": 3,
          "medium": 5,
          "low": 2
        }
      },
      "performance": {
        "averageResponseTime": 145,
        "slowRequests": 8
      },
      "bookings": {
        "successes": 98,
        "failures": 2,
        "failureRate": 0.02
      },
      "payments": {
        "successes": 95,
        "failures": 3,
        "failureRate": 0.03
      },
      "healthChecks": {
        "successes": 150,
        "failures": 0,
        "consecutive_failures": 0
      }
    },
    "timestamp": "2025-03-31T14:30:00.000Z",
    "alertThresholds": {
      "errorRate": {
        "warning": 0.05,
        "critical": 0.1
      },
      "responseTime": {
        "warning": 2000,
        "critical": 5000
      },
      "booking": {
        "failureRate": 0.1,
        "maxProcessingTime": 30000
      },
      "payment": {
        "failureRate": 0.05,
        "maxProcessingTime": 15000
      },
      "health": {
        "checkFailures": 3,
        "responseTime": 10000
      }
    }
  }
}
```

---

#### 2. Reset Alert Metrics

Reset alert metrics (useful for testing or after incidents).

**Endpoint**: `POST /api/v1/monitoring/alerts/reset`

**Authentication**: Admin required

**Example Request**:
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/alerts/reset"
```

---

#### 3. Test Alert System

Send a test alert to configured channels.

**Endpoint**: `POST /api/v1/monitoring/alerts/test`

**Authentication**: Admin required

**Request Body**:
```json
{
  "alertType": "test_alert",
  "severity": "warning"
}
```

**Example Request**:
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "deployment_test", "severity": "info"}' \
  "http://localhost:5001/api/v1/monitoring/alerts/test"
```

**Use Cases**:
- Verify Slack/Discord integration
- Test alert notification channels
- Validate webhook configurations

---

#### 4. Monitoring Status

Get comprehensive monitoring system status.

**Endpoint**: `GET /api/v1/monitoring/status`

**Authentication**: Admin required

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/status"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "monitoring": {
      "status": "healthy",
      "environment": "production",
      "initialized": true,
      "sentryDsn": "configured"
    },
    "alerts": {
      "status": "healthy",
      "metricsAvailable": true
    },
    "timestamp": "2025-03-31T14:30:00.000Z"
  }
}
```

---

#### 5. Real-time System Metrics

Get comprehensive real-time system metrics.

**Endpoint**: `GET /api/v1/monitoring/metrics/realtime`

**Authentication**: Admin required

**Example Request**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/metrics/realtime"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "alerts": {
      "errors": { "total": 12, "bySeverity": {...} },
      "performance": {...},
      "bookings": {...},
      "payments": {...}
    },
    "monitoring": {
      "status": "healthy",
      "initialized": true
    },
    "system": {
      "uptime": 86400,
      "memory": {...},
      "cpu": {...},
      "platform": "darwin",
      "nodeVersion": "v18.16.0",
      "pid": 12345
    },
    "timestamp": "2025-03-31T14:30:00.000Z"
  }
}
```

---

#### 6. Export Monitoring Data

Export monitoring metrics for analysis.

**Endpoint**: `GET /api/v1/monitoring/export`

**Authentication**: Admin required

**Query Parameters**:
- `format` (optional): `json` or `csv` (default: `json`)

**Example Request (JSON)**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/export?format=json" \
  -o monitoring-report.json
```

**Example Request (CSV)**:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/monitoring/export?format=csv" \
  -o monitoring-report.csv
```

---

#### 7. Flush Monitoring Data

Flush pending monitoring data to Sentry.

**Endpoint**: `POST /api/v1/monitoring/flush`

**Authentication**: Admin required

**Request Body**:
```json
{
  "timeout": 5000
}
```

**Example Request**:
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timeout": 5000}' \
  "http://localhost:5001/api/v1/monitoring/flush"
```

## 🔔 Alert System Explained

### What the Alert System Does

The alert system monitors your application in real-time and sends notifications when issues are detected. It tracks:

1. **Error Rates**: Monitors application errors and their severity
2. **Performance**: Tracks API response times and slow requests
3. **Bookings**: Monitors booking success/failure rates
4. **Payments**: Tracks payment processing success rates
5. **Health Checks**: Monitors system health status

### Alert Triggers

Alerts are triggered when thresholds are exceeded:

- **Error Rate Alert**: > 5% errors per minute (warning), > 10% (critical)
- **Performance Alert**: Response time > 2s (warning), > 5s (critical)
- **Booking Failure Alert**: > 10% failure rate
- **Payment Failure Alert**: > 5% failure rate
- **Health Check Alert**: 3 consecutive failures

### Alert Notifications

When alerts are triggered, notifications are sent to:
- **Slack** (if webhook configured)
- **Discord** (if webhook configured)
- **Email** (if configured)
- **Sentry** (if DSN configured)

### Does the Alert System Cause Breaking Changes?

**NO** - The alert system is completely non-breaking:

✅ **No Impact on Existing Functionality**:
- Alerts only **monitor** and **notify** - they don't block requests
- If alert service fails, your app continues working normally
- All alert logic is isolated and error-handled

✅ **Graceful Degradation**:
- Missing webhook URLs? Alerts log to console instead
- No Sentry DSN? Alerts still track internally
- Redis unavailable? Uses in-memory tracking

✅ **Safe by Design**:
```javascript
// Alert tracking never throws errors
try {
  alertService.trackError(error, context);
} catch (alertError) {
  // Silently continues - your app is unaffected
}
```

✅ **Zero Performance Impact**:
- Alerts are tracked asynchronously
- No blocking operations
- Minimal memory footprint

### When Alerts Are Triggered

**Example Alert Flow**:
1. User booking fails 3 times in a row
2. Alert system detects failure rate > threshold
3. Alert notification sent to Slack/Discord
4. You investigate and fix the issue
5. **User's booking request was never blocked**

The alert system is purely observational - it watches and notifies but never interferes with your application's normal operation.

## 📈 Integration Examples

### Building a Dashboard

```javascript
// Example: Fetch all metrics for dashboard
async function fetchDashboardData() {
  const [analytics, health, monitoring] = await Promise.all([
    fetch('/api/v1/analytics/dashboard'),
    fetch('/api/v1/health/detailed'),
    fetch('/api/v1/monitoring/metrics/realtime')
  ]);

  return {
    analytics: await analytics.json(),
    health: await health.json(),
    monitoring: await monitoring.json()
  };
}
```

### Scheduled Reports

```bash
#!/bin/bash
# daily-report.sh - Run daily analytics report

export ADMIN_TOKEN="your-admin-token"
REPORT_DATE=$(date +%Y-%m-%d)

# Fetch analytics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:5001/api/v1/analytics/export?format=csv&days=1" \
  -o "reports/analytics-${REPORT_DATE}.csv"

# Send to email or Slack
# ... notification logic ...
```

### Health Check Monitoring

```bash
#!/bin/bash
# health-monitor.sh - Continuous health monitoring

while true; do
  STATUS=$(curl -s http://localhost:5001/api/v1/health | jq -r '.status')

  if [ "$STATUS" != "healthy" ]; then
    # Send alert
    echo "⚠️ System unhealthy: $STATUS"
    # Trigger incident response
  fi

  sleep 60
done
```

## 🎯 Best Practices

### 1. Regular Monitoring
```bash
# Set up cron job for daily health checks
0 9 * * * /path/to/health-check.sh
```

### 2. Dashboard Integration
- Use analytics endpoints for business dashboards
- Display real-time metrics for operations team
- Export data for executive reporting

### 3. Alert Configuration
- Configure Slack/Discord for immediate notifications
- Set appropriate alert thresholds for your traffic
- Test alerts regularly

### 4. Performance Tracking
- Monitor `/health/metrics` for performance trends
- Use analytics to identify bottlenecks
- Track response times over time

## 📝 API Quick Reference

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `GET /api/v1/analytics/dashboard` | Complete business overview | Yes (Admin) |
| `GET /api/v1/analytics/conversion` | Conversion funnel metrics | Yes (Admin) |
| `GET /api/v1/analytics/trends` | Booking trends over time | Yes (Admin) |
| `GET /api/v1/analytics/services` | Service type performance | Yes (Admin) |
| `GET /api/v1/analytics/users` | User behavior metrics | Yes (Admin) |
| `GET /api/v1/analytics/revenue` | Revenue analytics | Yes (Admin) |
| `GET /api/v1/analytics/realtime` | Real-time metrics | Yes (Admin) |
| `GET /api/v1/health` | Basic health check | No |
| `GET /api/v1/health/detailed` | Detailed health check | No |
| `GET /api/v1/health/live` | Liveness probe | No |
| `GET /api/v1/health/ready` | Readiness probe | No |
| `GET /api/v1/health/metrics` | System metrics | No |
| `GET /api/v1/monitoring/alerts` | Alert metrics | Yes (Admin) |
| `GET /api/v1/monitoring/status` | Monitoring status | Yes (Admin) |
| `GET /api/v1/monitoring/metrics/realtime` | Real-time monitoring | Yes (Admin) |

These APIs provide complete observability into your application's health, performance, and business metrics! 🚀