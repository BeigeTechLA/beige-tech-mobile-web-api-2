# Transaction History API Documentation

## Overview

The Transaction History system provides a unified view of all monetary transactions for CP users, clients, and administrators. It tracks earnings, withdrawals, and payments in a centralized manner.

## API Endpoints

### For CP Users and Clients

#### 1. Get My Transactions
```
GET /api/v1/transactions/my-transactions
```
**Description:** Get transaction history for the logged-in user (CP or Client)

**Authentication:** Required

**Query Parameters:**
- `type` (optional): Filter by transaction type (`earning`, `withdrawal`, `payment`)
- `status` (optional): Filter by status (`pending`, `completed`, `failed`, `cancelled`)
- `dateFrom` (optional): Start date for filtering (ISO format)
- `dateTo` (optional): End date for filtering (ISO format)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)
- `sortBy` (optional): Sort field and order (e.g., `transactionDate:desc`)

**Example Request:**
```bash
GET /api/v1/transactions/my-transactions?type=earning&page=1&limit=10
```

**Example Response:**
```json
{
  "results": [
    {
      "id": "65abc123...",
      "type": "earning",
      "amount": 250,
      "status": "completed",
      "shootName": "Nasir wedding",
      "clientName": "John Doe",
      "transactionDate": "2024-05-06T00:00:00.000Z",
      "description": "Earnings from Nasir wedding"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 3,
  "totalResults": 25
}
```

---

#### 2. Get Transaction Summary
```
GET /api/v1/transactions/summary
```
**Description:** Get financial summary for logged-in user (total earnings, last month earnings, available balance)

**Authentication:** Required

**Query Parameters:**
- `dateFrom` (optional): Start date for period calculation
- `dateTo` (optional): End date for period calculation

**Example Response:**
```json
{
  "totalTransactions": 5000,
  "earningLastMonth": 150,
  "availableBalance": 1250
}
```

---

#### 3. Export Transactions to CSV
```
GET /api/v1/transactions/export
```
**Description:** Download transaction history as CSV file

**Authentication:** Required

**Query Parameters:**
- `type` (optional): Filter by transaction type
- `status` (optional): Filter by status
- `dateFrom` (optional): Start date for filtering
- `dateTo` (optional): End date for filtering

**Example Request:**
```bash
GET /api/v1/transactions/export?dateFrom=2024-01-01&dateTo=2024-12-31
```

**Response:** CSV file download

---

### For Admin Only

#### 4. Get All Transactions
```
GET /api/v1/transactions
```
**Description:** Get all transactions across all users (Admin only)

**Authentication:** Required (Admin role)

**Query Parameters:**
- `userId` (optional): Filter by specific user ID
- `type` (optional): Filter by transaction type
- `status` (optional): Filter by status
- `dateFrom` (optional): Start date
- `dateTo` (optional): End date
- `page` (optional): Page number
- `limit` (optional): Results per page

**Example Response:**
```json
{
  "results": [
    {
      "id": "65abc123...",
      "type": "earning",
      "userId": {
        "id": "65xyz...",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "amount": 250,
      "status": "completed",
      "shootName": "Nasir wedding",
      "clientName": "John Doe",
      "transactionDate": "2024-05-06T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 50,
  "totalResults": 500
}
```

---

#### 5. Get User Transactions (Admin)
```
GET /api/v1/transactions/user/:userId
```
**Description:** Get all transactions for a specific user (Admin only)

**Authentication:** Required (Admin role)

**Path Parameters:**
- `userId`: User ID

**Query Parameters:** Same as endpoint #4

---

#### 6. Get User Transaction Summary (Admin)
```
GET /api/v1/transactions/summary/:userId
```
**Description:** Get transaction summary for a specific user (Admin only)

**Authentication:** Required (Admin role)

**Path Parameters:**
- `userId`: User ID

---

#### 7. Create Transaction (Admin)
```
POST /api/v1/transactions
```
**Description:** Manually create a transaction (for corrections/adjustments)

**Authentication:** Required (Admin role)

**Request Body:**
```json
{
  "type": "earning",
  "userId": "65xyz...",
  "amount": 500,
  "status": "completed",
  "orderId": "65abc...",
  "shootName": "Test Shoot",
  "clientId": "65def...",
  "clientName": "John Doe",
  "description": "Manual adjustment"
}
```

---

#### 8. Update Transaction Status (Admin)
```
PATCH /api/v1/transactions/:transactionId
```
**Description:** Update the status of a transaction

**Authentication:** Required (Admin role)

**Request Body:**
```json
{
  "status": "completed"
}
```

---

#### 9. Delete Transaction (Admin)
```
DELETE /api/v1/transactions/:transactionId
```
**Description:** Delete a transaction record

**Authentication:** Required (Admin role)

---

## Transaction Types

### 1. Earning
- Created when an order is marked as "completed"
- Automatically adds to CP's `totalEarnings` and `currentBalance`
- Links to the order and client information

### 2. Withdrawal
- Created when a CP requests a payout
- Status: `pending` → `completed` (when paid) or `cancelled`
- Includes invoice ID and transaction ID (generated on approval)
- Deducts from CP's `currentBalance` when marked as paid

### 3. Payment
- Created when a client pays for an order
- Links to the order and payment intent
- Shows in client's transaction history

---

## Automatic Transaction Creation

The system automatically creates transaction records in these scenarios:

### When Order is Completed
**File:** `src/services/order.service.js`
**Function:** `updateAmountToCpsProfile()`

When an order status changes to "completed":
1. Calculates earnings for each CP
2. Updates CP's balance
3. **Automatically creates an earning transaction record**

### When Payout is Created
**File:** `src/services/payout.service.js`
**Function:** `createWithdrawRequest()`

When a CP requests a withdrawal:
1. Creates a payout record
2. **Automatically creates a withdrawal transaction with "pending" status**

### When Payout is Approved
**File:** `src/services/payout.service.js`
**Function:** `updatePayoutData()`

When admin marks payout as "paid":
1. Generates invoice ID and transaction ID
2. Deducts from CP's balance
3. **Updates the transaction status to "completed"**
4. Adds invoice ID and transaction ID to the transaction record

### When Payout is Cancelled
When admin marks payout as "canceled":
1. **Updates the transaction status to "cancelled"**

---

## Frontend Integration Examples

### CP Transaction History Page

```javascript
// Fetch transactions for logged-in CP
const fetchMyTransactions = async (page = 1) => {
  const response = await fetch(
    `/api/v1/transactions/my-transactions?page=${page}&limit=10`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  return await response.json();
};

// Fetch summary data
const fetchSummary = async () => {
  const response = await fetch('/api/v1/transactions/summary', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return await response.json();
};

// Export to CSV
const exportTransactions = () => {
  window.location.href = `/api/v1/transactions/export?token=${token}`;
};
```

### Admin View - All Transactions

```javascript
// Fetch all transactions (admin)
const fetchAllTransactions = async (filters = {}) => {
  const params = new URLSearchParams(filters);
  const response = await fetch(
    `/api/v1/transactions?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    }
  );
  return await response.json();
};

// Filter by date range
const filterByDateRange = async (from, to) => {
  return fetchAllTransactions({
    dateFrom: from,
    dateTo: to,
    page: 1,
    limit: 10
  });
};
```

---

## Database Schema

### Transaction Model

```javascript
{
  type: String,              // "earning", "withdrawal", "payment"
  userId: ObjectId,          // CP or Client ID
  amount: Number,            // Transaction amount
  status: String,            // "pending", "completed", "failed", "cancelled"
  orderId: ObjectId,         // Related order (optional)
  shootName: String,         // Order/shoot name
  clientId: ObjectId,        // Client reference (for CP earnings)
  clientName: String,        // Client display name
  payoutId: ObjectId,        // Related payout (for withdrawals)
  invoiceId: String,         // Invoice number (for withdrawals)
  transactionId: String,     // Transaction ID (for withdrawals)
  paymentMethod: String,     // Payment method used
  paymentIntentId: ObjectId, // Stripe payment intent (for payments)
  transactionDate: Date,     // When transaction occurred
  description: String,       // Transaction description
  metadata: Mixed,           // Additional data
  createdAt: Date,
  updatedAt: Date
}
```

---

## Migration Guide

If you have existing data and want to populate transaction history:

### Option 1: Backfill from Orders
Create a script to generate transaction records from completed orders:

```javascript
// scripts/backfill-transactions.js
const Order = require('../src/models/order.model');
const transactionService = require('../src/services/transaction.service');

async function backfillTransactions() {
  const completedOrders = await Order.find({
    order_status: 'completed',
    'payment.payment_status': { $in: ['paid', 'partially_paid'] }
  });

  for (const order of completedOrders) {
    const acceptedCPs = order.cp_ids.filter(cp => cp.decision === 'accepted');

    for (const cp of acceptedCPs) {
      const amount = order.shoot_cost / order.cp_ids.length;
      await transactionService.createEarningTransaction(
        order._id,
        cp.id,
        amount
      );
    }
  }
}
```

### Option 2: Backfill from Payouts
Create a script to generate transaction records from existing payouts:

```javascript
// scripts/backfill-payout-transactions.js
const Payout = require('../src/models/payout.model');
const transactionService = require('../src/services/transaction.service');

async function backfillPayoutTransactions() {
  const payouts = await Payout.find({});

  for (const payout of payouts) {
    await transactionService.createWithdrawalTransaction(payout._id);
  }
}
```

---

## Testing the API

### Using cURL

```bash
# Get my transactions
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/transactions/my-transactions

# Get summary
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/transactions/summary

# Export to CSV
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/transactions/export > transactions.csv

# Admin: Get all transactions
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:3000/api/v1/transactions?page=1&limit=10
```

---

## Notes

1. **Automatic Creation:** Transactions are automatically created when orders are completed or payouts are created/updated. No manual intervention needed.

2. **Real-time Updates:** The system updates transaction records in real-time as order statuses and payout statuses change.

3. **Data Integrity:** All transactions link back to their source (orders or payouts) for audit trails.

4. **Performance:** Indexes are created on commonly queried fields (`userId`, `transactionDate`, `type`, `status`) for optimal performance.

5. **Permissions:**
   - CP users can only see their own transactions
   - Clients can only see their own payment transactions
   - Admins can see all transactions

6. **CSV Export:** The export feature generates a CSV file with columns: Date, Shoot, Client, Amount, Type, Status

---

## Support

For questions or issues, contact the development team or refer to the main API documentation.
