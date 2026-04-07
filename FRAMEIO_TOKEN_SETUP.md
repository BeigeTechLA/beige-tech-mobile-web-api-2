# How to Generate Frame.io Developer Token with Full Project Access

## Method 1: Using next.frame.io (Modern Frame.io V4)

### Step 1: Access Developer Settings
1. Go to **https://next.frame.io**
2. Log in with your Frame.io account
3. Click your profile icon (top right)
4. Select **Settings** from the dropdown
5. Navigate to **Developer** section in the left sidebar

### Step 2: Create Developer Token
1. In the Developer section, find **Developer Tokens**
2. Click **Create New Token** or **Generate Token**
3. Give it a name: "Beige Backend API Token"
4. **Important**: Select ALL permissions:
   - ✅ Read projects
   - ✅ Write projects
   - ✅ Read assets
   - ✅ Write assets
   - ✅ Upload files
   - ✅ Delete assets
   - ✅ Manage team members (if available)
5. Click **Create Token**
6. **COPY THE TOKEN IMMEDIATELY** - it will only be shown once!

### Step 3: Create a Project for Uploads
1. In next.frame.io, click **New Project**
2. Name it: "Beige Uploads" (or whatever you prefer)
3. Click **Create**
4. Open the project
5. Copy the **Project ID** from the URL:
   ```
   https://next.frame.io/project/YOUR-PROJECT-ID/...
                                  ^^^^^^^^^^^^^^^^
                                  Copy this part
   ```

### Step 4: Update Your .env File
```bash
FRAMEIO_TOKEN=<paste-your-new-token-here>
FRAMEIO_PROJECT_ID=<paste-your-project-id-here>
FRAMEIO_AUTO_UPLOAD=true
```

### Step 5: Restart Your API Server
The server will automatically pick up the new configuration.

---

## Method 2: Using app.frame.io (Legacy V2)

### If next.frame.io doesn't show Developer section:

1. Go to **https://app.frame.io**
2. Navigate to **Account Settings** → **Developer**
3. Generate a new token with all scopes
4. Create a project in app.frame.io
5. Get the project ID from the project URL

---

## Troubleshooting

### "Can't find Developer section"
- Make sure you're logged into the **account owner** account
- Some trial accounts don't have developer access
- Contact Frame.io support to enable developer features

### "Token still can't access projects"
- Make sure the token was generated from the SAME account that owns the projects
- Verify all permissions were selected when creating the token
- Try generating a new token (old tokens may have limited scopes)

### "404 Not Found for projects"
- The project ID might be from a different Frame.io version (V2 vs V4)
- Make sure the project exists and you have access to it
- Try creating a new project after generating the new token

---

## Verify Token Works

After updating the token, test it:

```bash
curl -s "https://caren-auld-johnsie.ngrok-free.dev/v1/frameio/test" | jq .
```

You should see:
```json
{
  "success": true,
  "canAutoUpload": true,
  "projectInfo": {
    "rootAssetId": "some-asset-id"
  }
}
```

---

## Need Help?

If you're having trouble:
1. Make sure you're the account owner or have admin access
2. Try creating the token from next.frame.io instead of app.frame.io
3. Verify your Frame.io subscription includes API access
4. Contact Frame.io support if developer features aren't showing

