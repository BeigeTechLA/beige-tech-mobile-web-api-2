# Firebase Cloud Messaging (FCM) Backend Implementation

This documentation provides an overview of how Firebase Cloud Messaging (FCM) is integrated into the backend of the
project. It details the functions and workflow of the FCM service.

## FCM Token Model

The `FcmToken` model represents the storage mechanism for associating FCM tokens with users. This allows the backend to
efficiently manage and send notifications to specific devices associated with each user.

### Schema

The `FcmToken` schema consists of the following fields:

- `tokens`: An array of FCM tokens associated with the user. These tokens uniquely identify user devices and are used to
  send notifications.
- `user`: A reference to the `User` model, indicating the user to whom the tokens belong.
- `timestamps`: Automatic timestamps indicating the creation and update times of the record.

### Plugins

The `toJSON` plugin is applied to the `FcmToken` schema. This plugin converts the mongoose model to a JSON object,
facilitating consistent serialization when interacting with the API.
___

This model, in conjunction with other components of the FCM service, enables efficient and targeted delivery of
notifications to user devices. It's an integral part of the notification system that enhances user engagement and
interaction with the application.

## FCM Service Overview

The FCM service is responsible for managing FCM tokens, sending push notifications, and ensuring the efficient delivery
of notifications to devices running the front-end app.

### Functions Included

1. **saveFCMToken(userId, registrationToken):** Saves a user's FCM registration token in the database. If the token is
   not already associated with the user, it's added to the FcmToken's record.

2. **getTokensByUserId(userId):** Fetches the FCM tokens associated with a user from the database. Returns an array of
   tokens or `false` if no tokens are found.

3. **sendNotification(userId, title, content):** Sends a push notification to devices associated with a specific user.
   This function fetches the user's tokens, validates them, removes inactive tokens, and sends notifications using
   FCM's `sendEachForMulticast` method.

4. **checkToken(token):** Checks the validity and activity status of a given FCM token by sending a test notification.

5. **deleteInactiveTokens(userId):** Deletes inactive FCM tokens associated with a user. It retrieves the user's tokens,
   validates them using `checkToken`, and updates the database with active tokens.

### Workflow

1. **Token Registration:** The React Native iOS app or the front-end app registers the device's FCM token with the
   backend using the `/api/register-fcm-token` API endpoint. This registration associates the token with a specific
   user.

2. **Token Storage:** When a token is registered, the `saveFCMToken` function is called to save the token in the
   FcmToken's record in the database.

3. **Sending Notifications:** When the backend triggers a notification, the `sendNotification` function is called. It
   fetches the user's tokens using `getTokensByUserId`, checks their validity using `checkToken`, removes inactive
   tokens with `deleteInactiveTokens`, and sends the notification using FCM's `sendEachForMulticast` method.

## Usage Example

```javascript
const { fcmService } = require("../services");

// Example usage - Saving FCM token
const userId = 'user123';
const registrationToken = 'your-fcm-registration-token';

fcmService.saveFCMToken(userId, registrationToken)
  .then(success => {
    if (success) {
      console.log('FCM token saved successfully.');
    } else {
      console.error('Failed to save FCM token.');
    }
  })
  .catch(error => {
    console.error('Error saving FCM token:', error);
  });

// Example usage - Sending Notification
const notificationUserId = 'user456';
const notificationTitle = 'New Message';
const notificationContent = 'You have a new message';

fcmService.sendNotification(notificationUserId, notificationTitle, notificationContent)
  .then(success => {
    if (success) {
      console.log('Notification sent successfully.');
    } else {
      console.error('Failed to send notification.');
    }
  })
  .catch(error => {
    console.error('Error sending notification:', error);
  });
```

## React Native Developer Guide

The React Native developer needs to register the device with FCM to obtain the registration token, and then pass it to
the backend to associate it with a user. Here's how the React Native developer can achieve this:

1. **Install Dependencies**:
   In your React Native project, you need to install the `@react-native-firebase/app`
   and `@react-native-firebase/messaging` packages. You can install them using npm or yarn:

   ```bash
   npm install @react-native-firebase/app @react-native-firebase/messaging
   ```

   or

   ```bash
   yarn add @react-native-firebase/app @react-native-firebase/messaging
   ```

2. **Configure Firebase**:
   Follow the instructions provided by the `@react-native-firebase/app` package to configure Firebase in your React
   Native app. This usually involves adding your Firebase configuration to your app.

3. **Obtain the Registration Token**:
   In your React Native code, you can use the `messaging()` module from `@react-native-firebase/messaging` to obtain the
   registration token. This token uniquely identifies the device and is needed to send notifications.

   ```javascript
   import messaging from '@react-native-firebase/messaging';

   const getRegistrationToken = async () => {
     const token = await messaging().getToken();
     return token;
   };
   ```

4. **Pass the Token to Backend**:
   After obtaining the registration token, you can send it to your backend server using a network request. You might do
   this when the user logs in or when the app is launched for the first time. For example:

   ```javascript
   const registrationToken = await getRegistrationToken();

   // Send the registration token to the backend
   fetch('your-backend-api-endpoint', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({ userId: 'user-id', registrationToken }),
   });
   ```

5. **Handling Token Refresh**:
   Registration tokens can change due to various reasons. To handle token refresh, you can listen for
   the `onTokenRefresh` event and update the token on your backend accordingly:

   ```javascript
   messaging().onTokenRefresh((newToken) => {
     // Send the updated token to the backend
     fetch('your-backend-api-endpoint', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ userId: 'user-id', registrationToken: newToken }),
     });
   });
   ```

Remember that this is a basic guide to getting the registration token from a React Native app and passing it to the
backend. You might need to adjust the code to fit your specific use case and app architecture.

## Conclusion

The FCM service in the backend provides seamless integration of push notifications into the React Native iOS app. It
handles token management, notification sending, and ensures reliable communication between the backend and the app. This
documentation focuses on the FCM service's functions, their usage, and the overall workflow in the backend. It serves as
a comprehensive guide for future developers to understand and work with the FCM backend implementation.