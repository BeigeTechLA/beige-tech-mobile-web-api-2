# Push notification logs (API2 Dev)

API2 writes a separate JSON Lines log for FCM sends (messages, shoots, meetings, files, and future topics), token registration/removal, and preference changes. On the Dev server, files are stored in:

`/var/www/beige-web-dev-2/logs/push-notifications/`

Each file covers one UTC minute, for example `2026-09-25T09-30.jsonl`. Old files are removed on startup and checked every minute. A file is removed once its last write is at least one hour old. The normal PM2 logs remain separate.

After deploying API2 Dev and triggering a fresh push notification, run these commands on the API2 server:

```bash
cd /var/www/beige-web-dev-2
ls -lt logs/push-notifications
rg '"room_id":"YOUR_ROOM_ID"' logs/push-notifications
```

If `rg` is unavailable on the server, use:

```bash
grep -h '"room_id":"YOUR_ROOM_ID"' logs/push-notifications/*.jsonl
```

One delivery_summary JSON object is written per recipient push attempt. It includes the timestamp, recipient ID, topic, type, optional room/message IDs, active/allowed/blocked token counts, success/failure counts, and device results. `token_user_id` helps identify legacy ID aliases such as a room recipient `117` whose registered Client user ID is `720`. A `reason` of `NO_ACTIVE_FCM_TOKENS_FOR_USER` means API2 found no active token for that recipient. A device status of `failed` includes Firebase's error code when available.

For non-chat pushes, search by recipient or topic instead of room ID. Registration, removal, and preference changes appear as separate event values. Future triggers using the same API2 FCM send function will appear here automatically.

The log does not contain the message text, raw FCM token, or Firebase credentials. `status: "sent"` means Firebase accepted the send request; it does not confirm that the phone or browser displayed a popup.
