# Automatic Order Status Management Based on Shoot Dates

## Overview

This feature automatically updates order statuses based on shoot dates to ensure that project statuses accurately reflect the current stage of the shoot lifecycle. The system runs a cron job every hour to check and update order statuses.

## Problem Statement

Previously, the project status (`order_status`) was not managed according to shoot dates. This meant:
- Orders remained in "pending" status even when shoots were approaching or in progress
- Manual intervention was required to update statuses
- The admin dashboard and client views showed inaccurate project states

## Solution

An automated cron job that updates order statuses based on shoot dates:

### Status Transitions

The system automatically transitions orders through the following statuses:

1. **pending → pre_production**
   - Triggered when: Shoot is 1-7 days away
   - Condition: Current status is "pending"

2. **pre_production → production**
   - Triggered when: Current time is between shoot start and end time
   - Condition: Current status is "pending" or "pre_production"

3. **production → post_production**
   - Triggered when: Shoot end time has passed
   - Condition: Current status is "pending", "pre_production", or "production"

### Cron Job Schedule

- **Frequency**: Every hour (at minute 0)
- **Cron Expression**: `0 * * * *`
- **Function**: `updateOrderStatusByShootDate()`

## Implementation Details

### Files Modified

1. **`src/services/cron.service.js`**
   - Added `updateOrderStatusByShootDate()` function
   - Implements the status transition logic
   - Sends notifications to clients on status changes

2. **`src/index.js`**
   - Imported the new cron function
   - Registered the hourly cron job
   - Added error handling for the cron job

3. **`scripts/test-order-status-update.js`**
   - Test script to manually trigger status updates
   - Useful for testing and debugging

### Logic Flow

```javascript
For each active order (not cancelled, disputed, or completed):
  1. Get the earliest confirmed or pending shoot datetime
  2. Compare current time with shoot start/end times
  3. Determine appropriate status:
     - If now >= shootEndTime → post_production
     - If now >= shootStartTime AND now < shootEndTime → production
     - If shootStartTime within next 7 days → pre_production
  4. Update status if needed
  5. Send notification to client about status change
```

### Excluded Statuses

The following statuses are **not** automatically updated:
- `cancelled` - Manual action required
- `in_dispute` - Requires resolution
- `completed` - Final status
- `revision` - Manual intervention required

### Shoot Date Criteria

The system only processes shoot datetimes with:
- `date_status: "confirmed"` or `date_status: "pending"`
- Orders with `shoot_datetimes` array populated

## Notifications

When an order status is automatically updated, the client receives a notification with:

- **Pre-production**: "Your shoot is coming up soon! We are in the pre-production phase."
- **Production**: "Your shoot is happening now!"
- **Post-production**: "Your shoot has been completed! We are now in post-production."

Notification metadata includes:
- Order ID
- Order name
- Old status
- New status
- Type: `orderStatusUpdate`

## Testing

### Manual Test

Run the test script to manually trigger status updates:

```bash
node scripts/test-order-status-update.js
```

### Expected Behavior

1. Script connects to MongoDB
2. Finds all active orders with shoot datetimes
3. Evaluates each order against current time
4. Updates statuses as needed
5. Logs all status changes
6. Sends notifications to affected clients

### Verification Steps

1. Create a test order with a shoot date in the past
2. Run the test script
3. Verify the order status changed to `post_production`
4. Check that a notification was sent to the client
5. Verify logs show the status transition

## Monitoring

### Logs

The cron job logs the following:
- Start of cron job execution
- Number of active orders found
- Each status change with order details
- Errors encountered during processing
- Completion with count of updated orders

Example log output:
```
Running cron job: updateOrderStatusByShootDate
Found 15 active orders to process
Order 507f1f77bcf86cd799439011 (Wedding_Shoot_123): Status updated from "pending" to "pre_production" based on shoot date 2024-02-20T10:00:00.000Z
Completed cron job: updateOrderStatusByShootDate. Updated 3 orders.
```

### Error Handling

- Individual order errors are logged but don't stop processing
- Failed notifications don't prevent status updates
- Database connection errors are caught and logged

## Configuration

### Adjusting Time Windows

To modify when statuses change, edit the time window in `cron.service.js`:

```javascript
// Current: 7 days before shoot → pre_production
const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

// To change to 3 days:
const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
```

### Changing Cron Frequency

To run more or less frequently, edit the cron expression in `src/index.js`:

```javascript
// Current: Every hour
cron.schedule("0 * * * *", ...)

// Every 30 minutes:
cron.schedule("*/30 * * * *", ...)

// Every 2 hours:
cron.schedule("0 */2 * * *", ...)
```

## Troubleshooting

### Status Not Updating

1. **Check cron job is running**
   - Look for log: "Running hourly cron job: Update order status by shoot date"
   - If missing, check if server restarted successfully

2. **Verify shoot datetime format**
   - Ensure `start_date_time` and `end_date_time` are valid Date objects
   - Check `date_status` is "confirmed" or "pending"

3. **Check current order status**
   - Some statuses don't auto-update (cancelled, in_dispute, completed)
   - Verify order is in a status that can transition

4. **Review logs for errors**
   - Check application logs for cron job errors
   - Look for specific order processing errors

### Notifications Not Received

1. **Verify client_id exists** on the order
2. **Check notification service** is functioning
3. **Review FCM token** for the client
4. **Check notification logs** for delivery status

## Future Enhancements

Potential improvements to consider:

1. **Configurable time windows** - Allow admins to set custom pre-production windows
2. **Manual override protection** - Option to prevent auto-updates for specific orders
3. **Email notifications** - Send email in addition to push notifications
4. **Dashboard widget** - Show upcoming status transitions
5. **Revision detection** - Auto-move to revision status based on client feedback
6. **Completion criteria** - Auto-complete based on file delivery or client approval

## Related Documentation

- [Auto Reassignment System](./AUTO_REASSIGNMENT.md)
- [Notification System](./NOTIFICATION_SYSTEM.md)
- [Cron Jobs Overview](./CRON_JOBS.md)

## Support

For issues or questions about automatic status management:
1. Check the logs for specific error messages
2. Run the test script to diagnose issues
3. Review this documentation for configuration options
4. Contact the development team with log details
