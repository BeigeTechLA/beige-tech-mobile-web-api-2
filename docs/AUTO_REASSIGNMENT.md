# Automatic Order Reassignment Feature

## Overview

This feature automatically reassigns orders to the next ranked Content Provider (CP) when the currently assigned CP doesn't accept the order within 24 hours.

## How It Works

### 1. **Order Assignment Tracking**
- When a CP is assigned to an order, an `assignedAt` timestamp is recorded
- Each CP in the `cp_ids` array has:
  - `id`: The CP's user ID
  - `decision`: Status (pending, accepted, cancelled, booked)
  - `assignedAt`: Timestamp when the CP was assigned to the order

### 2. **Automatic Monitoring**
- A cron job runs every hour (`0 * * * *`)
- It checks for orders where:
  - Order is not cancelled
  - CP decision is "pending"
  - CP was assigned more than 24 hours ago

### 3. **Reassignment Process**

When a CP hasn't responded within 24 hours:

1. **Check for Accepted CP**
   - If another CP has already accepted the order, the expired pending CP is simply marked as "cancelled"
   - No reassignment occurs

2. **Find Next Ranked CP**
   - If no CP has accepted, the system finds the next highest-ranked available CP
   - Uses the same ranking algorithm based on:
     - Distance (20%)
     - Rating (25%)
     - Acceptance Rate (20%)
     - Trust Score (20%)
     - Tier Level (10%)
     - Recent Activity (5%)

3. **Update Order**
   - Expired pending CP is marked as "cancelled"
   - Next ranked CP is added with "pending" status
   - New `assignedAt` timestamp is set

4. **Update Related Booking** (if applicable)
   - If the order has an associated booking (`booking_ref`), the booking's `salesRepId` is updated to the new CP
   - This ensures the new CP is properly linked as the sales representative for the booking

5. **Notifications**
   - Expired CP receives notification about assignment expiration
   - New CP receives notification about the new assignment
   - Client is notified about the reassignment

## Database Schema Changes

### Order Model (`cp_ids` field)
```javascript
cp_ids: [
  {
    id: ObjectId,           // CP user ID
    decision: String,       // 'pending', 'accepted', 'cancelled', 'booked'
    assignedAt: Date        // NEW: Timestamp of assignment
  }
]
```

## Files Modified/Created

### Created Files:
1. **`src/services/cron.service.js`** - Cron job service for auto-reassignment
2. **`scripts/test-auto-reassign.js`** - Test script for the feature
3. **`docs/AUTO_REASSIGNMENT.md`** - This documentation

### Modified Files:
1. **`src/models/order.model.js`** - Added `assignedAt` field to `cp_ids`
2. **`src/services/order.service.js`** - Updated to set `assignedAt` when adding CPs
3. **`src/index.js`** - Initialized cron job
4. **`package.json`** - Added `node-cron` dependency

## Configuration

### Cron Schedule
The cron job runs every hour. To modify the schedule, edit [src/index.js](../src/index.js:25):

```javascript
// Current: Every hour (production setting)
cron.schedule("0 * * * *", ...)

// Examples of other schedules:
// Every 30 minutes: "*/30 * * * *"
// Every 6 hours: "0 */6 * * *"
// Daily at midnight: "0 0 * * *"
// Every 4 seconds (for testing): "*/4 * * * * *"
```

### Timeout Duration
The 24-hour timeout is defined in [src/services/cron.service.js](../src/services/cron.service.js:16):

```javascript
// Production setting: 24 hours
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
```

To change the timeout (e.g., to 12 hours):
```javascript
const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
```

For testing purposes, you can reduce to 30 seconds:
```javascript
const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
```

## Testing

### Manual Test
Run the test script to manually trigger the reassignment check:

```bash
node scripts/test-auto-reassign.js
```

### Create Test Scenario

1. Create an order with a CP assigned
2. Manually set the `assignedAt` timestamp to more than 24 hours ago:

```javascript
// In MongoDB shell or Compass
db.orders.updateOne(
  { _id: ObjectId("YOUR_ORDER_ID") },
  {
    $set: {
      "cp_ids.0.assignedAt": new Date(Date.now() - 25 * 60 * 60 * 1000)
    }
  }
)
```

3. Run the test script or wait for the next cron execution
4. Verify:
   - Old CP is marked as "cancelled"
   - New CP is added with "pending" status
   - Notifications are sent to all parties

## Logging

The feature logs important events:
- When cron job starts
- Number of orders found with expired pending CPs
- Reassignment actions
- Errors during reassignment

Check logs for:
```
Running cron job: checkAndReassignPendingOrders
Found X orders with expired pending CPs
Order XXX: Reassigning to next CP YYY (rank score: Z)
```

## Edge Cases Handled

1. **No Available CPs** - If no more CPs match the criteria, the expired CP is cancelled and no new CP is assigned
2. **Already Accepted** - If another CP has accepted, expired pending CPs are just cancelled
3. **Multiple Expired CPs** - All expired pending CPs are processed
4. **Geo-location Missing** - System handles missing location data gracefully

## API Integration

No new API endpoints are required. The feature works automatically in the background.

However, when creating or updating orders via API, ensure `assignedAt` is set:

```javascript
// Example: When adding a CP to an order
order.cp_ids.push({
  id: cpId,
  decision: 'pending',
  assignedAt: new Date()  // Important!
});
```

## Performance Considerations

- The cron job queries orders efficiently using indexes
- Only processes orders that match specific criteria
- Asynchronous processing prevents blocking
- Error handling ensures one failed reassignment doesn't affect others

## Future Enhancements

Possible improvements:
1. Configurable timeout duration per order type
2. Email notifications in addition to push notifications
3. Multiple retry attempts with different CPs
4. CP performance tracking based on response time
5. Admin dashboard to view reassignment history

## Troubleshooting

### Cron job not running
- Check server logs for initialization message
- Verify `node-cron` is installed
- Check for syntax errors in cron schedule

### Orders not being reassigned
- Verify `assignedAt` field is set on orders
- Check if orders meet all criteria (not cancelled, pending, >24h old)
- Run test script manually to check for errors

### Notifications not sent
- Verify FCM service is configured
- Check notification service logs
- Ensure CP has valid device tokens

## Support

For issues or questions, check:
1. Server logs for error messages
2. MongoDB for data integrity
3. Notification service logs for delivery status
