# Notification API Documentation

## Table of Contents
- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Data Models](#data-models)
- [API Endpoints](#api-endpoints)
- [Role-Based Access](#role-based-access)
- [Error Handling](#error-handling)
- [Code Examples](#code-examples)

---

## Overview

The Notification API provides a comprehensive notification system that supports:
- Role-based notifications (Admin, Client, Content Provider)
- Category-based organization
- Model-based notifications (Order, Booking, Payment, etc.)
- Read/Unread status tracking
- Pagination support
- Real-time notification management

---

## Base URL

```
Development: http://localhost:5002/v1/notifications
Production: https://api-staging.beige.app/v1/notifications
```

---

## Authentication

All API endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

To obtain a token, use the login endpoint:

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

---

## Data Models

### Notification Schema

```javascript
{
  "_id": "ObjectId",                    // Auto-generated
  "modelName": "String",                // Required: Order, Booking, Payment, etc.
  "modelId": "ObjectId",                // Required: ID of the related model
  "clientId": "ObjectId",               // Optional: Client user ID
  "cpIds": ["ObjectId"],                // Optional: Content Provider IDs array
  "message": "String",                  // Required: Notification message
  "isRead": "Boolean",                  // Default: false
  "readAt": "Date",                     // Optional: When marked as read
  "category": "String",                 // Required: Same as modelName
  "metadata": {                         // Optional: Additional data
    "key": "value"
  },
  "createdAt": "Date",                  // Auto-generated
  "updatedAt": "Date"                   // Auto-generated
}
```

### Query Parameters

Common query parameters for GET requests:

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page` | Number | Page number (default: 1) | `page=1` |
| `limit` | Number | Items per page (default: 10) | `limit=20` |
| `sortBy` | String | Sort field and order | `sortBy=createdAt:desc` |
| `modelName` | String | Filter by model name | `modelName=Order` |
| `modelId` | ObjectId | Filter by model ID | `modelId=507f...` |
| `category` | String | Filter by category | `category=Order` |
| `isRead` | Boolean | Filter by read status | `isRead=false` |
| `populate` | String | Populate references | `populate=clientId` |

---

## API Endpoints

### 1. Create Notification (New Schema)

Creates a new notification using the current schema.

**Endpoint:** `POST /`

**Request Body:**
```json
{
  "modelName": "Order",
  "modelId": "507f1f77bcf86cd799439011",
  "clientId": "507f1f77bcf86cd799439012",
  "cpIds": ["507f1f77bcf86cd799439013"],
  "message": "Your order #12345 has been confirmed",
  "category": "Order",
  "metadata": {
    "orderNumber": "12345",
    "status": "confirmed"
  }
}
```

**Success Response (201):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "modelName": "Order",
  "modelId": "507f1f77bcf86cd799439011",
  "clientId": "507f1f77bcf86cd799439012",
  "cpIds": ["507f1f77bcf86cd799439013"],
  "message": "Your order #12345 has been confirmed",
  "category": "Order",
  "isRead": false,
  "metadata": {
    "orderNumber": "12345",
    "status": "confirmed"
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### 2. Create Notification (Legacy)

Creates a notification using the legacy format for backward compatibility.

**Endpoint:** `POST /legacy`

**Request Body:**
```json
{
  "modelName": "Booking",
  "modelId": "507f1f77bcf86cd799439014",
  "message": "Your booking has been updated",
  "category": "Booking"
}
```

**Success Response (201):** Same as new schema

---

### 3. Get All Notifications

Retrieves all notifications with pagination and filtering.

**Endpoint:** `GET /`

**Query Parameters:**
- All common query parameters apply
- Role-based filtering is automatic

**Examples:**

```
GET /?page=1&limit=10&sortBy=createdAt:desc
GET /?category=Order&isRead=false
GET /?modelName=Order&modelId=507f1f77bcf86cd799439011
```

**Success Response (200):**
```json
{
  "results": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "modelName": "Order",
      "message": "Your order has been confirmed",
      "isRead": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      // ... other fields
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 5,
  "totalResults": 48
}
```

---

### 4. Get My Notifications

Retrieves notifications for the current authenticated user.

**Endpoint:** `GET /my`

**Query Parameters:**
- `page` (optional)
- `limit` (optional)
- `sortBy` (optional)

**Example:**
```
GET /my?page=1&limit=20&sortBy=createdAt:desc
```

**Success Response (200):**
```json
{
  "results": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "message": "Your order has been confirmed",
      "isRead": false,
      // ... other fields
    }
  ],
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "totalResults": 52
}
```

---

### 5. Get Notifications by Category

Retrieves all notifications for a specific category.

**Endpoint:** `GET /category/:category`

**URL Parameters:**
- `category` (required): Order, Booking, Payment, etc.

**Examples:**
```
GET /category/Order
GET /category/Booking
GET /category/Payment
```

**Success Response (200):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439015",
    "category": "Order",
    "message": "Your order has been confirmed",
    // ... other fields
  }
]
```

---

### 6. Get Notifications by Model

Retrieves all notifications for a specific model instance.

**Endpoint:** `GET /model/:modelName/:modelId`

**URL Parameters:**
- `modelName` (required): Order, Booking, etc.
- `modelId` (required): ObjectId of the model

**Example:**
```
GET /model/Order/507f1f77bcf86cd799439011
```

**Success Response (200):**
```json
[
  {
    "_id": "507f1f77bcf86cd799439015",
    "modelName": "Order",
    "modelId": "507f1f77bcf86cd799439011",
    "message": "Your order has been confirmed",
    // ... other fields
  }
]
```

---

### 7. Get Unread Count

Gets the count of unread notifications for the current user.

**Endpoint:** `GET /unread-count`

**Success Response (200):**
```json
{
  "count": 15
}
```

---

### 8. Get Specific Notification

Retrieves a single notification by ID.

**Endpoint:** `GET /:notificationId`

**URL Parameters:**
- `notificationId` (required): ObjectId of the notification

**Example:**
```
GET /507f1f77bcf86cd799439015
```

**Success Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "modelName": "Order",
  "message": "Your order has been confirmed",
  // ... all fields
}
```

**Error Response (404):**
```json
{
  "code": 404,
  "message": "Notification not found"
}
```

---

### 9. Mark Notification as Read

Marks a specific notification as read.

**Endpoint:** `PATCH /:notificationId/read`

**URL Parameters:**
- `notificationId` (required): ObjectId of the notification

**Example:**
```
PATCH /507f1f77bcf86cd799439015/read
```

**Success Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "isRead": true,
  "readAt": "2024-01-15T11:00:00.000Z",
  // ... other fields
}
```

---

### 10. Mark All as Read

Marks all notifications as read for the current user.

**Endpoint:** `PATCH /mark-all-read`

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439012",
  "userRole": "client"
}
```

**Success Response (200):**
```json
{
  "modifiedCount": 15,
  "message": "All notifications marked as read"
}
```

---

### 11. Update Notification

Updates a notification's content or metadata.

**Endpoint:** `PATCH /:notificationId`

**URL Parameters:**
- `notificationId` (required): ObjectId of the notification

**Request Body:**
```json
{
  "message": "Updated: Your order has been shipped",
  "metadata": {
    "orderNumber": "12345",
    "status": "shipped",
    "trackingNumber": "TRACK123456"
  }
}
```

**Success Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439015",
  "message": "Updated: Your order has been shipped",
  "metadata": {
    "orderNumber": "12345",
    "status": "shipped",
    "trackingNumber": "TRACK123456"
  },
  // ... other fields
}
```

---

### 12. Delete Notification

Deletes a specific notification.

**Endpoint:** `DELETE /:notificationId`

**URL Parameters:**
- `notificationId` (required): ObjectId of the notification

**Example:**
```
DELETE /507f1f77bcf86cd799439015
```

**Success Response (204):** No content

---

### 13. Delete Notifications by Model

Deletes all notifications related to a specific model instance.

**Endpoint:** `DELETE /model/:modelName/:modelId`

**URL Parameters:**
- `modelName` (required): Order, Booking, etc.
- `modelId` (required): ObjectId of the model

**Example:**
```
DELETE /model/Order/507f1f77bcf86cd799439011
```

**Success Response (200):**
```json
{
  "deletedCount": 5,
  "message": "Notifications deleted successfully"
}
```

---

## Role-Based Access

The API automatically filters notifications based on user roles:

### Admin Role
- Can see all notifications
- No filtering applied

### Client Role
- Only sees notifications where `clientId` matches their user ID
- Automatic filtering: `filter.clientId = req.user._id`

### Content Provider Role
- Only sees notifications where their ID is in the `cpIds` array
- Automatic filtering: `filter.cpIds = req.user._id`

---

## Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "code": 401,
  "message": "Please authenticate"
}
```

**404 Not Found:**
```json
{
  "code": 404,
  "message": "Notification not found"
}
```

**400 Bad Request:**
```json
{
  "code": 400,
  "message": "Validation error",
  "errors": [
    {
      "field": "modelName",
      "message": "modelName is required"
    }
  ]
}
```

**500 Internal Server Error:**
```json
{
  "code": 500,
  "message": "Internal server error"
}
```

---

## Code Examples

### JavaScript/Axios

```javascript
// Import axios
import axios from 'axios';

// Base configuration
const API_BASE_URL = 'http://localhost:5002/v1/notifications';
const authToken = 'your_jwt_token_here';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  }
});

// 1. Get my notifications
async function getMyNotifications(page = 1, limit = 10) {
  try {
    const response = await axiosInstance.get('/my', {
      params: { page, limit, sortBy: 'createdAt:desc' }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching notifications:', error.response?.data);
    throw error;
  }
}

// 2. Get unread count
async function getUnreadCount() {
  try {
    const response = await axiosInstance.get('/unread-count');
    return response.data.count;
  } catch (error) {
    console.error('Error fetching unread count:', error.response?.data);
    throw error;
  }
}

// 3. Mark notification as read
async function markAsRead(notificationId) {
  try {
    const response = await axiosInstance.patch(`/${notificationId}/read`);
    return response.data;
  } catch (error) {
    console.error('Error marking as read:', error.response?.data);
    throw error;
  }
}

// 4. Mark all as read
async function markAllAsRead(userId, userRole) {
  try {
    const response = await axiosInstance.patch('/mark-all-read', {
      userId,
      userRole
    });
    return response.data;
  } catch (error) {
    console.error('Error marking all as read:', error.response?.data);
    throw error;
  }
}

// 5. Create notification
async function createNotification(data) {
  try {
    const response = await axiosInstance.post('/', data);
    return response.data;
  } catch (error) {
    console.error('Error creating notification:', error.response?.data);
    throw error;
  }
}

// 6. Get notifications by category
async function getNotificationsByCategory(category) {
  try {
    const response = await axiosInstance.get(`/category/${category}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching by category:', error.response?.data);
    throw error;
  }
}

// 7. Delete notification
async function deleteNotification(notificationId) {
  try {
    await axiosInstance.delete(`/${notificationId}`);
    return true;
  } catch (error) {
    console.error('Error deleting notification:', error.response?.data);
    throw error;
  }
}

// Usage examples
(async () => {
  // Get my notifications
  const notifications = await getMyNotifications(1, 10);
  console.log('My notifications:', notifications);

  // Get unread count
  const unreadCount = await getUnreadCount();
  console.log('Unread count:', unreadCount);

  // Mark first notification as read
  if (notifications.results.length > 0) {
    const updated = await markAsRead(notifications.results[0]._id);
    console.log('Marked as read:', updated);
  }
})();
```

### React Hook Example

```javascript
import { useState, useEffect } from 'react';
import axios from 'axios';

// Custom hook for notifications
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API_BASE_URL = 'http://localhost:5002/v1/notifications';
  const authToken = localStorage.getItem('authToken');

  const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  // Fetch notifications
  const fetchNotifications = async (page = 1, limit = 10) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get('/my', {
        params: { page, limit, sortBy: 'createdAt:desc' }
      });
      setNotifications(response.data.results);
      return response.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch notifications');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const response = await axiosInstance.get('/unread-count');
      setUnreadCount(response.data.count);
      return response.data.count;
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  // Mark as read
  const markAsRead = async (notificationId) => {
    try {
      const response = await axiosInstance.patch(`/${notificationId}/read`);

      // Update local state
      setNotifications(prev =>
        prev.map(n => n._id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));

      return response.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark as read');
      throw err;
    }
  };

  // Mark all as read
  const markAllAsRead = async (userId, userRole) => {
    try {
      const response = await axiosInstance.patch('/mark-all-read', {
        userId,
        userRole
      });

      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);

      return response.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark all as read');
      throw err;
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId) => {
    try {
      await axiosInstance.delete(`/${notificationId}`);

      // Update local state
      setNotifications(prev => prev.filter(n => n._id !== notificationId));

      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete notification');
      throw err;
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification
  };
}

// Usage in a component
function NotificationList() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead
  } = useNotifications();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Notifications ({unreadCount} unread)</h2>
      <button onClick={() => markAllAsRead('userId', 'client')}>
        Mark All as Read
      </button>

      <ul>
        {notifications.map(notification => (
          <li
            key={notification._id}
            style={{ fontWeight: notification.isRead ? 'normal' : 'bold' }}
            onClick={() => markAsRead(notification._id)}
          >
            {notification.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### TypeScript Types

```typescript
// Notification types
export interface Notification {
  _id: string;
  modelName: string;
  modelId: string;
  clientId?: string;
  cpIds?: string[];
  message: string;
  isRead: boolean;
  readAt?: Date;
  category: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedNotifications {
  results: Notification[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface CreateNotificationDto {
  modelName: string;
  modelId: string;
  clientId?: string;
  cpIds?: string[];
  message: string;
  category: string;
  metadata?: Record<string, any>;
}

export interface UpdateNotificationDto {
  message?: string;
  metadata?: Record<string, any>;
}

export interface NotificationQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  modelName?: string;
  modelId?: string;
  category?: string;
  isRead?: boolean;
  populate?: string;
}
```

---

## Best Practices

### 1. Pagination
Always use pagination for list endpoints to improve performance:
```javascript
// Good
const notifications = await getNotifications({ page: 1, limit: 20 });

// Avoid fetching all at once
```

### 2. Real-time Updates
Consider implementing WebSocket or polling for real-time notification updates:
```javascript
// Polling example
setInterval(async () => {
  const count = await getUnreadCount();
  updateBadge(count);
}, 30000); // Every 30 seconds
```

### 3. Optimistic Updates
Update UI immediately, then sync with server:
```javascript
// Mark as read optimistically
const markAsReadOptimistic = (id) => {
  // Update UI first
  updateLocalState(id);

  // Then sync with server
  markAsRead(id).catch(() => {
    // Rollback on error
    revertLocalState(id);
  });
};
```

### 4. Error Handling
Always handle errors gracefully:
```javascript
try {
  await createNotification(data);
} catch (error) {
  if (error.response?.status === 401) {
    // Redirect to login
    redirectToLogin();
  } else if (error.response?.status === 400) {
    // Show validation errors
    showValidationErrors(error.response.data.errors);
  } else {
    // Show generic error
    showErrorMessage('Something went wrong');
  }
}
```

### 5. Caching
Implement caching to reduce API calls:
```javascript
// Use React Query or SWR for automatic caching
import { useQuery } from 'react-query';

const { data } = useQuery('notifications', fetchNotifications, {
  staleTime: 30000, // 30 seconds
  refetchOnWindowFocus: true
});
```

---

## Support

For questions or issues, contact the backend team or refer to:
- API Source Code: `/src/routes/v1/notification.route.js`
- Controller: `/src/controllers/notification.controller.js`
- Service: `/src/services/notification.service.js`
- Model: `/src/models/notification.model.js`

---

**Last Updated:** 2024-01-15
**API Version:** 1.0
**Maintained By:** Backend Team
