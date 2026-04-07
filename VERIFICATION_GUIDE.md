# CP Folder Access Control - Quick Verification Guide

## 🎯 What Was Fixed?

**Problem**: Content Providers (CP) could see booking folders immediately after assignment, even before accepting the order.

**Solution**: Modified `getFiles()` function to check if CP has `decision: "accepted"` before showing folders.

---

## ✅ Quick Verification Steps

### Step 1: Get Test Data
```bash
# Get a CP user ID and token from your database
CP_USER_ID="6965cde8c0ecf3be61b70c1a"
ORDER_ID="696f25d39de2079784f5bd47"
CP_TOKEN="<your-cp-token>"
```

### Step 2: Test BEFORE Acceptance
```bash
curl 'http://localhost:5002/v1/gcp/get-files/6965cde8c0ecf3be61b70c1a' \
  -H 'authorization: Bearer YOUR_CP_TOKEN'
```

**Expected**: Empty array or no order folder visible
```json
{
  "files": [],
  "totalFiles": 0
}
```

### Step 3: Accept the Order
```bash
curl 'http://localhost:5002/v1/orders/696f25d39de2079784f5bd47' \
  -X 'PATCH' \
  -H 'authorization: Bearer YOUR_CP_TOKEN' \
  -H 'content-type: application/json' \
  --data-raw '{"cp_ids":[{"id":"6965cde8c0ecf3be61b70c1a","decision":"accepted"}]}'
```

**Expected**: Order updated with `decision: "accepted"`

### Step 4: Test AFTER Acceptance
```bash
curl 'http://localhost:5002/v1/gcp/get-files/6965cde8c0ecf3be61b70c1a' \
  -H 'authorization: Bearer YOUR_CP_TOKEN'
```

**Expected**: Folder now visible
```json
{
  "files": [
    {
      "id": "...",
      "name": "John's Wedding Photography_bd47",
      "isFolder": true,
      "orderId": "696f25d39de2079784f5bd47",
      "cpIds": ["6965cde8c0ecf3be61b70c1a"]
    }
  ],
  "totalFiles": 1
}
```

---

## 🔍 Key Code Changes

### File: `src/services/gcpFile.service.js`

#### Change 1: Get Accepted Orders for CP
```javascript
// NEW: For CP users, get list of orderIds where they have accepted
let acceptedOrderIds = [];
if (role === 'cp' && userId) {
  const Order = require('../models/order.model');
  const acceptedOrders = await Order.find({
    'cp_ids': {
      $elemMatch: {
        id: userId,
        decision: 'accepted'  // ← KEY CHANGE
      }
    }
  }).select('_id');
  
  acceptedOrderIds = acceptedOrders.map(order => order._id.toString());
}
```

#### Change 2: Filter Folders by Accepted Orders
```javascript
// For CP: Only allow access if they have accepted the order
if (role === 'cp' && acceptedOrderIds.length > 0) {
  userAccessFilter.$or.push({
    'metadata.cpIds': userIdStr,
    'metadata.orderId': { $in: acceptedOrderIds }  // ← KEY CHANGE
  });
}
```

---

## 🧪 Automated Test Script

Run the automated test script:
```bash
cd /Users/luminous_imteaj/Documents/Beige/api
./test-cp-folder-access.sh
```

**Note**: Update the script variables first:
- `CP_USER_ID`
- `ORDER_ID`
- `CP_TOKEN`

---

## 📊 Expected Behavior Matrix

| Scenario | CP Can See Folder? | Reason |
|----------|-------------------|--------|
| CP assigned, decision: "pending" | ❌ No | Not accepted yet |
| CP assigned, decision: "accepted" | ✅ Yes | Accepted the order |
| CP assigned, decision: "cancelled" | ❌ No | Cancelled/rejected |
| CP assigned, decision: "booked" | ❌ No | Not accepted yet |
| Admin/PM user | ✅ Yes | Always visible |
| Client (order owner) | ✅ Yes | Always visible |

---

## 🐛 Troubleshooting

### Problem: CP still sees folder before accepting
**Check**:
1. Are you using the latest code?
2. Is the server restarted?
3. Check console logs for: `📂 ========== getFiles CALLED ==========`
4. Verify query shows: `✅ CP has accepted these orders: []` (empty before acceptance)

### Problem: CP doesn't see folder after accepting
**Check**:
1. Verify order acceptance was successful:
   ```bash
   curl 'http://localhost:5002/v1/orders/{orderId}' \
     -H 'authorization: Bearer {TOKEN}'
   ```
2. Check `cp_ids[].decision` is "accepted"
3. Check folder `metadata.orderId` matches the order ID
4. Check console logs for: `✅ CP has accepted these orders: ['{orderId}']`

### Problem: Database query errors
**Check**:
1. Ensure Order model is imported: `const Order = require('../models/order.model');`
2. Check MongoDB indexes on `cp_ids` field
3. Verify FileMeta has `metadata.orderId` field populated

---

## 📝 Rollback Plan

If issues arise, you can temporarily disable the check:

```javascript
// In getFiles() function, comment out the CP acceptance check:
/*
let acceptedOrderIds = [];
if (role === 'cp' && userId) {
  const Order = require('../models/order.model');
  const acceptedOrders = await Order.find({
    'cp_ids': {
      $elemMatch: {
        id: userId,
        decision: 'accepted'
      }
    }
  }).select('_id');
  
  acceptedOrderIds = acceptedOrders.map(order => order._id.toString());
}
*/
```

Then restore the original `userAccessFilter` logic.

---

## 📞 Questions?

- Check: `CP_FOLDER_ACCESS_FIX.md` for comprehensive documentation
- Review: Console logs with `📂` emoji for debugging info
- Test: Use Postman collection: `BEIGE_Complete_API_Collection.postman_collection.json`

---

**Implementation Date**: January 20, 2026
**Status**: ✅ Implemented and ready for testing
