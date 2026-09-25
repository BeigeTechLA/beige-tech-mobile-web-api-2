# Mobile chat push contract (Dev)

When a new chat message is sent, API2 sends this FCM shape to each eligible device:

```json
{
  "notification": {
    "title": "New message in Parth_1043",
    "body": "Admin: Hello"
  },
  "data": {
    "topic": "messages",
    "type": "newMessage",
    "roomId": "6a682b1ca715391cc69aa070",
    "messageId": "6ab5ff5f0263cb51e4a25e9a"
  }
}
```

`title` uses the room name, or `Chat #<chat_id>` if the name is absent. `body` is the sender and a short preview. All `data` values are strings. The mobile app maps `type: "newMessage"` to its local `NotificationType.chat` and opens the chat identified by `roomId`. `messageId` can be used to locate the new message. The server sends no other chat routing keys. FCM and the Flutter SDK add transport metadata such as `from`, `sentTime`, `collapseKey`, and platform notification settings to the received `RemoteMessage`; those are not custom fields sent by the app server.

To disable message push on one registered device/session, call the authenticated Web API endpoint:

```http
PATCH /v1/push-notifications/preferences
Content-Type: application/json

{
  "session_id": "THE_SAME_SESSION_ID_USED_AT_TOKEN_REGISTRATION",
  "notification_preferences": {
    "topics": { "messages": false }
  }
}
```

Then call `GET /v1/push-notifications/preferences?session_id=THE_SAME_SESSION_ID_USED_AT_TOKEN_REGISTRATION` and confirm `topics.messages` is `false`. API2 checks the preference before sending. Re-registering a token with default `true` values does not re-enable an existing disabled preference; use the preference endpoint to change it. Preferences are per session, so another registered device for the same user can still receive the push.

For web, open Chrome DevTools Console on the signed-in Messages page. A foreground push logs `[WebPush] Foreground push received` with the title, type, room ID, and message ID. Background/closed-tab delivery is handled by the service worker and may not appear in that page's console. The push is sent from API2, not the web frontend.
