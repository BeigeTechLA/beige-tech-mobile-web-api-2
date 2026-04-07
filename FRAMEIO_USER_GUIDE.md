# Frame.io Integration Guide

## How to Use Frame.io with Your File Manager

This guide explains how to integrate Frame.io with your file manager so you can watch videos with full Frame.io features (comments, annotations, time-coded feedback, etc.) directly in your system.

## Current Setup Status

✅ **Backend API**: Connected and working
✅ **Frontend Player**: Configured with proper iframe permissions
✅ **Manual Linking**: Fully functional
⚠️ **Auto-Upload**: Disabled (Frame.io account has reached usage limits)

## How It Works

When you upload a video to your file manager, you need to link it to Frame.io. Once linked, clicking the video will show the embedded Frame.io player with ALL features including:

- ✨ Video playback
- 💬 Comments and annotations
- ⏱️ Time-coded feedback
- 👥 Collaboration tools
- ✅ Approval workflows
- 📝 Version control

## Step-by-Step: Linking Videos to Frame.io

### 1. Upload Your Video to Frame.io

First, upload your video to Frame.io manually:

1. Go to [Frame.io](https://app.frame.io) or [next.frame.io](https://next.frame.io)
2. Navigate to your project
3. Upload your video file
4. Wait for Frame.io to process the video

### 2. Get the Share Link from Frame.io

Once your video is uploaded to Frame.io:

1. **Click on the video** in Frame.io
2. **Click the "Share" button** (or "Present" button)
3. **Copy the share link** - it will look like one of these:
   - `https://f.io/abc123`
   - `https://next.frame.io/project/xxx/view/yyy?share=zzz`
   - `https://app.frame.io/player/xxx`

### 3. Upload the Same Video to Your File Manager

1. Go to your file manager in your application
2. Upload the video file (the same one you uploaded to Frame.io)
3. Wait for the upload to complete

### 4. Link the Video to Frame.io

1. **Click on the video** you just uploaded in the file manager
2. You'll see a message: **"Link to Frame.io"**
3. **Click the "Link to Frame.io" button**
4. **Paste the Frame.io share link** you copied in step 2
5. Click **"Link Video"**

### 5. Watch with Frame.io Features

Now when you click the video in your file manager:

- ✅ It will show the **embedded Frame.io player**
- ✅ You can **add comments and annotations**
- ✅ All Frame.io features work directly in your system
- ✅ No need to open Frame.io in another tab!

## Accepted Frame.io Link Formats

✅ **These work:**
- `https://f.io/abc123` (short link)
- `https://next.frame.io/project/.../view/...?share=...` (review link)
- `https://app.frame.io/player/...` (player link)
- `https://next.frame.io/embed/...` (embed link)

❌ **These DON'T work:**
- `https://accounts.frame.io/...` (account/settings pages)
- `https://next.frame.io/project/...` (project page without /view/)
- Asset IDs without a full URL

## Troubleshooting

### "Invalid Frame.io URL" error

Make sure you're using a **Share link** from Frame.io, not a project or account page URL.

**How to get the right link:**
1. Open your video in Frame.io
2. Click "Share" or "Present" button
3. Copy the link provided

### Video doesn't embed properly

Check that:
1. The Frame.io video is fully processed (not still uploading)
2. You have permission to view the video in Frame.io
3. The share link hasn't expired

### Can't see comments/annotations

Make sure:
1. You're using a **Review link** from Frame.io (not just a player link)
2. The Frame.io iframe has proper permissions (already configured)
3. You're logged into Frame.io in your browser

## For Admins: Enabling Auto-Upload

⚠️ **Currently disabled** due to Frame.io account usage limits.

To enable auto-upload (videos automatically sync to Frame.io):

1. Upgrade your Frame.io plan or clear usage limits
2. Create a Frame.io project for uploads
3. Update `/api/.env`:
   ```
   FRAMEIO_AUTO_UPLOAD=true
   FRAMEIO_PROJECT_ID=your-project-id
   ```
4. Restart the backend server

Once enabled, videos will automatically upload to Frame.io when added to the file manager.

## Benefits of This Integration

- 🎯 **Centralized workflow**: No need to switch between your app and Frame.io
- 💬 **Team collaboration**: Everyone can comment and review in one place
- ⏱️ **Time-saving**: Click and watch with full Frame.io features instantly
- 🔒 **Secure**: Uses Frame.io's share links with proper permissions
- 🎨 **Professional**: Clean embedded experience in your app

## Need Help?

- Check Frame.io documentation: https://help.frame.io
- Test your Frame.io API connection: GET `/v1/frameio/test`
- Contact support if you encounter issues
