# Notification API - Quick Reference Guide

## 🚀 Quick Start

### Base URL
```
http://localhost:5002/v1/notifications
```

### Authentication
All requests require JWT token in header:
```javascript
headers: {
  'Authorization': 'Bearer YOUR_TOKEN_HERE'
}
```

---

## 📋 Common Use Cases

### 1. Get User's Notifications (with badge count)
```javascript
// Get unread count for badge
GET /unread-count
// Response: { "count": 15 }

// Get recent notifications
GET /my?page=1&limit=10&sortBy=createdAt:desc
```

### 2. Mark Notification as Read (on click)
```javascript
PATCH /:notificationId/read
// Returns updated notification with isRead: true
```

### 3. Mark All as Read
```javascript
PATCH /mark-all-read
Body: { "userId": "userId", "userRole": "client" }
```

### 4. Get Notifications for Specific Order/Booking
```javascript
GET /model/Order/507f1f77bcf86cd799439011
```

### 5. Create Notification (Backend use)
```javascript
POST /
Body: {
  "modelName": "Order",
  "modelId": "orderId",
  "message": "Your order has been confirmed",
  "category": "Order"
}
```

---

## 🎯 All Endpoints at a Glance

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `POST` | `/` | Create notification | ✅ |
| `POST` | `/legacy` | Create (legacy format) | ✅ |
| `GET` | `/` | Get all (paginated) | ✅ |
| `GET` | `/my` | Get my notifications | ✅ |
| `GET` | `/category/:category` | Get by category | ✅ |
| `GET` | `/model/:modelName/:modelId` | Get by model | ✅ |
| `GET` | `/unread-count` | Get unread count | ✅ |
| `GET` | `/:notificationId` | Get specific one | ✅ |
| `PATCH` | `/:notificationId/read` | Mark as read | ✅ |
| `PATCH` | `/mark-all-read` | Mark all as read | ✅ |
| `PATCH` | `/:notificationId` | Update notification | ✅ |
| `DELETE` | `/:notificationId` | Delete one | ✅ |
| `DELETE` | `/model/:modelName/:modelId` | Delete all for model | ✅ |

---

## 💡 React Component Example

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const api = axios.create({
    baseURL: 'http://localhost:5002/v1/notifications',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  // Fetch unread count and notifications
  useEffect(() => {
    fetchUnreadCount();
    fetchNotifications();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async () => {
    const { data } = await api.get('/unread-count');
    setUnreadCount(data.count);
  };

  const fetchNotifications = async () => {
    const { data } = await api.get('/my?limit=10&sortBy=createdAt:desc');
    setNotifications(data.results || data);
  };

  const handleMarkAsRead = async (id) => {
    await api.patch(`/${id}/read`);
    setUnreadCount(prev => Math.max(0, prev - 1));
    setNotifications(prev =>
      prev.map(n => n._id === id ? {...n, isRead: true} : n)
    );
  };

  const handleMarkAllAsRead = async () => {
    const userId = localStorage.getItem('userId');
    const userRole = localStorage.getItem('userRole');

    await api.patch('/mark-all-read', { userId, userRole });
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({...n, isRead: true})));
  };

  return (
    <div className="notification-bell">
      <button onClick={() => setShowDropdown(!showDropdown)}>
        🔔
        {unreadCount > 0 && (
          <span className="badge">{unreadCount}</span>
        )}
      </button>

      {showDropdown && (
        <div className="dropdown">
          <div className="header">
            <h3>Notifications ({unreadCount} unread)</h3>
            <button onClick={handleMarkAllAsRead}>Mark all read</button>
          </div>

          <div className="list">
            {notifications.length === 0 ? (
              <p>No notifications</p>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif._id}
                  className={notif.isRead ? 'read' : 'unread'}
                  onClick={() => handleMarkAsRead(notif._id)}
                >
                  <p>{notif.message}</p>
                  <small>{new Date(notif.createdAt).toLocaleString()}</small>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
```

---

## 🔍 Query Parameters

### Pagination
```javascript
GET /my?page=1&limit=20
```

### Sorting
```javascript
// Newest first (default)
GET /my?sortBy=createdAt:desc

// Oldest first
GET /my?sortBy=createdAt:asc
```

### Filtering
```javascript
// Only unread
GET /my?isRead=false

// Only read
GET /my?isRead=true

// By category
GET /my?category=Order

// Combine filters
GET /my?isRead=false&category=Order&page=1&limit=10
```

---

## 🎨 Response Formats

### Single Notification
```json
{
  "_id": "507f...",
  "modelName": "Order",
  "modelId": "507f...",
  "message": "Your order has been confirmed",
  "isRead": false,
  "category": "Order",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Paginated List
```json
{
  "results": [...notifications],
  "page": 1,
  "limit": 10,
  "totalPages": 5,
  "totalResults": 48
}
```

### Unread Count
```json
{
  "count": 15
}
```

---

## 🚨 Error Handling

```javascript
try {
  const response = await api.get('/my');
  setNotifications(response.data.results);
} catch (error) {
  if (error.response?.status === 401) {
    // Unauthorized - redirect to login
    window.location.href = '/login';
  } else if (error.response?.status === 404) {
    // Not found
    console.error('Notification not found');
  } else {
    // Other errors
    console.error('Error:', error.response?.data?.message);
  }
}
```

---

## 📦 Notification Categories

Common categories you'll encounter:

- `Order` - Order-related notifications
- `Booking` - Booking updates
- `Payment` - Payment confirmations/failures
- `Message` - New messages
- `System` - System announcements
- `Review` - Review requests/responses

---

## 🔐 Role-Based Access

The API automatically filters based on user role:

- **Admin**: Sees all notifications
- **Client**: Sees only their notifications (where `clientId` matches)
- **Content Provider**: Sees notifications in their `cpIds` array

You don't need to filter manually - just call the endpoints!

---

## ⚡ Performance Tips

### 1. Use Pagination
```javascript
// Good ✅
GET /my?page=1&limit=20

// Bad ❌ - Don't fetch all at once
GET /my?limit=1000
```

### 2. Poll Efficiently
```javascript
// Good ✅ - Poll every 30-60 seconds
setInterval(fetchUnreadCount, 30000);

// Bad ❌ - Don't poll too frequently
setInterval(fetchUnreadCount, 1000);
```

### 3. Optimistic Updates
```javascript
// Update UI immediately, then sync
const markAsRead = async (id) => {
  // Update UI first
  updateLocalState(id);

  // Sync with server
  try {
    await api.patch(`/${id}/read`);
  } catch (error) {
    // Rollback on error
    revertLocalState(id);
  }
};
```

---

## 🧪 Testing the API

### Using the HTTP file
1. Open `notification-api-tests.http`
2. Replace `{{authToken}}` with your JWT token
3. Run any request directly in VS Code (with REST Client extension)

### Using Postman
1. Import the Postman collection (if available)
2. Set the `authToken` variable
3. Run the requests

### Using cURL
```bash
# Get unread count
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5002/v1/notifications/unread-count

# Get my notifications
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5002/v1/notifications/my?page=1&limit=10

# Mark as read
curl -X PATCH \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5002/v1/notifications/NOTIFICATION_ID/read
```

---

## 📞 Need Help?

- **Full Documentation**: See `NOTIFICATION_API_DOCUMENTATION.md`
- **Test Collection**: See `notification-api-tests.http`
- **API Code**: `/src/routes/v1/notification.route.js`

---

## 🎯 Checklist for Frontend Integration

- [ ] Set up axios instance with base URL and auth header
- [ ] Create notification service/API layer
- [ ] Implement notification bell component
- [ ] Add unread count badge
- [ ] Implement mark as read on click
- [ ] Add "mark all as read" button
- [ ] Set up polling or WebSocket for real-time updates
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test with different user roles
- [ ] Add notifications list/dropdown
- [ ] Implement pagination for notification list
- [ ] Add empty state UI
- [ ] Test edge cases (no notifications, all read, etc.)

---

**Happy Coding! 🚀**
