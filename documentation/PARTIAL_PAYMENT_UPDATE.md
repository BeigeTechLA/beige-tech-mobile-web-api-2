# Partial Payment Implementation - Order & Payment Module Updates

## Overview

The Order and Payment modules have been updated to fully support partial payments. The system now properly handles `payment_status = "partially_paid"` and `payment_type = "partial"` with correct money calculations and CP earnings distribution.

## Key Changes Made

### 1. Order Service Updates (`src/services/order.service.js`)

**CP Earnings Logic Enhancement:**
- Now supports both `"paid"` and `"partially_paid"` orders for completion
- CP earnings calculated based on actual amount paid (not full shoot cost for partial payments)
- Added safety checks to prevent negative balances

**Updated Logic:**
```javascript
// Before: Only "paid" orders could trigger earnings
if (order.payment.payment_status === "paid") {
  // earnings logic
}

// After: Both "paid" and "partially_paid" orders can trigger earnings
if (order.payment.payment_status === "paid" || order.payment.payment_status === "partially_paid") {
  // earnings logic
}
```

### 2. Payment Service Updates (`src/services/payment.service.js`)

**Enhanced Payment Status Logic:**
- Improved logic for determining when an order is fully paid vs partially paid
- Proper handling of `amount_remaining` calculations

**Updated Logic:**
```javascript
// Enhanced payment status determination
if (orderRecord.payment.payment_type === "full") {
  orderRecord.payment.payment_status = "paid";
} else if (orderRecord.payment.payment_type === "partial") {
  if (amountRemaining <= 0) {
    orderRecord.payment.payment_status = "paid";
  } else {
    orderRecord.payment.payment_status = "partially_paid";
  }
}
```

### 3. Order Status Controller Updates (`src/controllers/orderStatus.controller.js`)

**Order Completion Rules:**
- Orders can now be marked as "completed" with `"partially_paid"` status
- Only "pending" payment status prevents completion

## API Usage Examples

### 1. Create Order with Partial Payment

**Endpoint:** `POST /v1/orders`

```json
{
  "client_id": "user_id_here",
  "cp_ids": [
    {
      "id": "cp_user_id_here",
      "decision": "accepted"
    }
  ],
  "order_name": "Wedding Photography Session",
  "service_type": "photography",
  "shoot_cost": 2000,
  "geo_location": {
    "type": "Point",
    "coordinates": [-74.006, 40.7128]
  },
  "budget": {
    "suggested": 2000,
    "max": 2500,
    "min": 1500
  },
  "payment": {
    "payment_type": "partial",
    "payment_status": "pending",
    "amount_paid": 0,
    "amount_remaining": 2000
  }
}
```

### 2. Update Order with Partial Payment

**Endpoint:** `PATCH /v1/orders/:orderId`

**Case A: First Partial Payment (50%)**
```json
{
  "payment": {
    "payment_type": "partial",
    "payment_status": "partially_paid",
    "amount_paid": 1000,
    "amount_remaining": 1000
  }
}
```

**Case B: Final Payment (Completing the order)**
```json
{
  "payment": {
    "payment_type": "partial",
    "payment_status": "paid",
    "amount_paid": 2000,
    "amount_remaining": 0
  }
}
```

**Case C: Order Completion with Partial Payment**
```json
{
  "order_status": "completed",
  "payment": {
    "payment_status": "partially_paid",
    "amount_paid": 1000,
    "amount_remaining": 1000
  }
}
```

### 3. Update Order Status (Allowing Partial Payment Completion)

**Endpoint:** `PATCH /v1/orders/:orderId/status`

```json
{
  "order_status": "completed"
}
```

*Note: This will now work for orders with `payment_status: "partially_paid"`*

## Payment Flow Examples

### Scenario 1: 50% Upfront, 50% on Completion

1. **Create Order:**
   ```json
   {
     "shoot_cost": 1000,
     "payment": {
       "payment_type": "partial",
       "payment_status": "pending",
       "amount_paid": 0,
       "amount_remaining": 1000
     }
   }
   ```

2. **First Payment (50%):**
   ```json
   {
     "payment": {
       "payment_type": "partial",
       "payment_status": "partially_paid",
       "amount_paid": 500,
       "amount_remaining": 500
     }
   }
   ```

3. **Complete Order (with partial payment):**
   ```json
   {
     "order_status": "completed"
   }
   ```
   *CP receives $500 earnings*

4. **Final Payment:**
   ```json
   {
     "payment": {
       "payment_status": "paid",
       "amount_paid": 1000,
       "amount_remaining": 0
     }
   }
   ```
   *CP receives additional $500 earnings*

### Scenario 2: Multiple Partial Payments

1. **Initial State:**
   ```json
   {
     "shoot_cost": 1500,
     "payment": {
       "payment_type": "partial",
       "payment_status": "pending",
       "amount_paid": 0,
       "amount_remaining": 1500
     }
   }
   ```

2. **First Payment (40%):**
   ```json
   {
     "payment": {
       "payment_status": "partially_paid",
       "amount_paid": 600,
       "amount_remaining": 900
     }
   }
   ```

3. **Second Payment (40%):**
   ```json
   {
     "payment": {
       "payment_status": "partially_paid",
       "amount_paid": 1200,
       "amount_remaining": 300
     }
   }
   ```

4. **Final Payment (20%):**
   ```json
   {
     "payment": {
       "payment_status": "paid",
       "amount_paid": 1500,
       "amount_remaining": 0
     }
   }
   ```

## CP Earnings Calculation

### For Partially Paid Orders:
- **Earnings = `amount_paid / number_of_cps`**
- Example: $1000 paid, 2 CPs → Each CP gets $500

### For Fully Paid Orders:
- **Earnings = `shoot_cost / number_of_cps`**
- Example: $2000 total, 2 CPs → Each CP gets $1000

### Progressive Earnings:
- CPs receive earnings based on actual payments received
- When additional payments are made, CPs receive the difference
- Earnings are updated when order status changes to "completed"

## Validation Rules

1. **Order Completion:**
   - ✅ `payment_status: "paid"` → Can complete
   - ✅ `payment_status: "partially_paid"` → Can complete
   - ❌ `payment_status: "pending"` → Cannot complete

2. **Payment Type:**
   - `"full"` → Single payment, status goes directly to "paid"
   - `"partial"` → Multiple payments, status progresses: "pending" → "partially_paid" → "paid"

3. **Amount Validation:**
   - `amount_paid + amount_remaining = shoot_cost`
   - `amount_remaining >= 0`
   - `amount_paid >= 0`

## Benefits of This Implementation

1. **Flexible Payment Options:** Clients can pay in installments
2. **Fair CP Compensation:** CPs get paid based on actual money received
3. **Order Completion:** Work can be completed even with partial payment
4. **Accurate Tracking:** Precise tracking of paid vs remaining amounts
5. **Business Logic:** Supports various payment scenarios and business models

## Testing

The implementation has been thoroughly tested with:
- ✅ Partial payment creation and updates
- ✅ CP earnings calculations for partial payments
- ✅ Order completion with partial payments
- ✅ Progressive payment scenarios
- ✅ Full payment completion flows
