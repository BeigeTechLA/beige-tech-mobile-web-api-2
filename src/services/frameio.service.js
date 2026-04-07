/**
 * Frame.io Service
 * Handles integration with Frame.io API
 * Supports both V2 (developer token) and V4 (Adobe OAuth)
 */

const httpStatus = require("http-status");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ApiError = require("../utils/ApiError");
const config = require("../config/config");
const FileMeta = require("../models/fileMeta.model");

// Frame.io API endpoints
const FRAMEIO_API_V2 = "https://api.frame.io/v2";
const FRAMEIO_API_V4 = "https://api.frame.io/v4";
const ADOBE_IMS_BASE = "https://ims-na1.adobelogin.com";

// File path for persistent token storage
const TOKEN_FILE_PATH = path.join(__dirname, "../../.frameio-tokens.json");

// Store OAuth tokens in memory (loaded from file on startup)
let oauthTokens = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
};

// Load tokens from file on startup
try {
  if (fs.existsSync(TOKEN_FILE_PATH)) {
    const savedTokens = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, "utf8"));
    if (savedTokens.accessToken) {
      oauthTokens = savedTokens;
      console.log("✅ Frame.io OAuth tokens loaded from file");
    }
  }
} catch (err) {
  console.log("No saved Frame.io tokens found (this is normal for first run)");
}

/**
 * Save OAuth tokens to file for persistence across server restarts
 */
const saveTokensToFile = () => {
  try {
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(oauthTokens, null, 2));
    console.log("💾 Frame.io OAuth tokens saved to file");
  } catch (err) {
    console.error("Failed to save Frame.io tokens:", err.message);
  }
};

// Track files currently being auto-uploaded to prevent duplicate uploads during polling
const autoUploadInProgress = new Set();
// Track files that failed auto-upload to prevent infinite retries
const autoUploadFailed = new Set();

/**
 * Clear failed status for a file to allow retry
 */
const clearFailedStatus = (fileMetaId) => {
  autoUploadFailed.delete(fileMetaId);
  console.log(`🔄 Cleared failed status for file: ${fileMetaId}`);
};

/**
 * Get the active access token (OAuth token preferred for next.frame.io, developer token as fallback)
 */
const getAccessToken = async () => {
  // Prefer OAuth token for next.frame.io projects
  if (oauthTokens.accessToken) {
    // Check if token needs refresh
    if (oauthTokens.expiresAt && Date.now() > oauthTokens.expiresAt - 60000) {
      await refreshAccessToken();
    }
    console.log("🔐 Using Adobe OAuth token for Frame.io API");
    return { token: oauthTokens.accessToken, tokenType: "oauth" };
  }

  // Fallback to developer token (works with app.frame.io projects)
  if (config.frameio.token) {
    return { token: config.frameio.token, tokenType: "developer" };
  }

  throw new ApiError(
    httpStatus.UNAUTHORIZED,
    "Frame.io not configured. Connect via OAuth or set FRAMEIO_TOKEN."
  );
};

/**
 * Get axios instance with Frame.io auth
 * Uses V4 API for OAuth tokens, V2 API for developer tokens
 */
const getFrameioClient = async () => {
  const { token, tokenType } = await getAccessToken();

  // Use V4 API for OAuth tokens (next.frame.io)
  // Use V2 API for developer tokens (app.frame.io)
  const baseURL = tokenType === "oauth" ? FRAMEIO_API_V4 : FRAMEIO_API_V2;

  console.log(`📡 Using Frame.io ${tokenType === "oauth" ? "V4" : "V2"} API`);

  return axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
};

/**
 * Get V4 client specifically (for OAuth/next.frame.io)
 */
const getFrameioClientV4 = async () => {
  if (!oauthTokens.accessToken) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "OAuth not connected. Please authorize Frame.io first."
    );
  }

  // Check if token needs refresh
  if (oauthTokens.expiresAt && Date.now() > oauthTokens.expiresAt - 60000) {
    await refreshAccessToken();
  }

  return axios.create({
    baseURL: FRAMEIO_API_V4,
    headers: {
      Authorization: `Bearer ${oauthTokens.accessToken}`,
      "Content-Type": "application/json",
    },
  });
};

/**
 * Get V2 client (for developer token)
 */
const getFrameioClientV2 = () => {
  if (!config.frameio.token) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Frame.io developer token not configured."
    );
  }

  return axios.create({
    baseURL: FRAMEIO_API_V2,
    headers: {
      Authorization: `Bearer ${config.frameio.token}`,
      "Content-Type": "application/json",
    },
  });
};

/**
 * Check if Frame.io is configured
 */
const isAuthorized = () => {
  return !!(config.frameio.token || oauthTokens.accessToken);
};

/**
 * Check if OAuth is configured and connected
 */
const isOAuthConnected = () => {
  return !!oauthTokens.accessToken;
};

/**
 * Get Adobe OAuth authorization URL
 */
const getAuthorizationUrl = () => {
  const { adobeClientId, adobeRedirectUri } = config.frameio;

  if (!adobeClientId) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Adobe Client ID not configured. Set ADOBE_CLIENT_ID in .env"
    );
  }

  // Adobe IMS scopes - must match those configured in Adobe Developer Console
  const scopes = "email offline_access openid additional_info.roles profile";
  const authUrl = `${ADOBE_IMS_BASE}/ims/authorize/v2?client_id=${adobeClientId}&redirect_uri=${encodeURIComponent(adobeRedirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code`;

  console.log("🔐 Adobe OAuth URL:", authUrl);
  return authUrl;
};

/**
 * Exchange authorization code for access token
 */
const exchangeCodeForToken = async (code) => {
  const { adobeClientId, adobeClientSecret, adobeRedirectUri } = config.frameio;

  if (!adobeClientId || !adobeClientSecret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Adobe OAuth credentials not configured"
    );
  }

  try {
    console.log("🔄 Exchanging code for token...");

    const response = await axios.post(
      `${ADOBE_IMS_BASE}/ims/token/v3`,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: adobeClientId,
        client_secret: adobeClientSecret,
        code,
        redirect_uri: adobeRedirectUri,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    oauthTokens = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
    };

    // Persist tokens to file
    saveTokensToFile();

    console.log("✅ OAuth tokens received successfully");
    return { success: true, message: "Frame.io connected via Adobe OAuth" };
  } catch (error) {
    console.error("OAuth token exchange failed:", error.response?.data || error.message);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to exchange code for token: ${error.response?.data?.error_description || error.message}`
    );
  }
};

/**
 * Refresh OAuth access token
 */
const refreshAccessToken = async () => {
  const { adobeClientId, adobeClientSecret } = config.frameio;

  if (!oauthTokens.refreshToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "No refresh token available");
  }

  try {
    const response = await axios.post(
      `${ADOBE_IMS_BASE}/ims/token/v3`,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: adobeClientId,
        client_secret: adobeClientSecret,
        refresh_token: oauthTokens.refreshToken,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    oauthTokens = {
      accessToken: access_token,
      refreshToken: refresh_token || oauthTokens.refreshToken,
      expiresAt: Date.now() + expires_in * 1000,
    };

    // Persist refreshed tokens to file
    saveTokensToFile();

    console.log("🔄 OAuth tokens refreshed");
    return oauthTokens.accessToken;
  } catch (error) {
    console.error("Token refresh failed:", error.response?.data || error.message);
    oauthTokens = { accessToken: null, refreshToken: null, expiresAt: null };
    // Clear persisted tokens on failure
    saveTokensToFile();
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to refresh token");
  }
};

/**
 * Get Frame.io file details by file ID
 */
const getAsset = async (assetId) => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    if (tokenType === "oauth") {
      // V4 API - try different endpoint patterns
      try {
        // First try: direct /files/{id}
        const response = await client.get(`/files/${assetId}`);
        return response.data?.data || response.data;
      } catch (v4Err1) {
        console.log(`V4 /files/${assetId} failed:`, v4Err1.response?.status);

        // Try with account context
        try {
          const accountsResponse = await client.get("/accounts");
          const accounts = accountsResponse.data?.data || accountsResponse.data || [];
          if (accounts[0]) {
            const response = await client.get(`/accounts/${accounts[0].id}/files/${assetId}`);
            return response.data?.data || response.data;
          }
        } catch (v4Err2) {
          console.log(`V4 with account context failed:`, v4Err2.response?.status);
        }

        // For V4, if we can't get asset details, return a minimal object
        // The asset exists (we created it), we just can't access it yet
        console.log(`📁 V4 asset ${assetId} - returning minimal info`);
        return {
          id: assetId,
          name: "Video",
          type: "file",
        };
      }
    }

    // V2 API
    const response = await client.get(`/assets/${assetId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new ApiError(httpStatus.NOT_FOUND, "Frame.io asset not found");
    }
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Frame.io API error: ${error.message}`
    );
  }
};

/**
 * Create a presentation link (view-only, no comments) for an asset
 * V2 API: POST /assets/{asset_id}/presentations
 * This is used for embedding where commenting doesn't work in iframes
 */
const createPresentationLink = async (assetId, options = {}) => {
  try {
    const { tokenType } = await getAccessToken();

    if (tokenType === "oauth") {
      // V4 API doesn't have separate presentation links
      // Return null to indicate we should use review link
      console.log("⚠️ V4 API: Presentation links not available, will use share link");
      return null;
    }

    // V2 API: Create presentation link
    const client = getFrameioClientV2();
    console.log(`🎬 Creating V2 presentation link for asset ${assetId}`);

    const response = await client.post(`/assets/${assetId}/presentations`, {
      title: options.name || "Video Presentation",
    });

    const presentation = response.data;
    console.log(`✅ Presentation link created: ${presentation.url}`);

    return {
      id: presentation.id,
      url: presentation.url,
      embed_url: presentation.url,
    };
  } catch (error) {
    console.log(`⚠️ Could not create presentation link: ${error.message}`);
    return null;
  }
};

/**
 * Create a review link (share) for an asset
 * V4 API: POST /accounts/{account_id}/projects/{project_id}/shares
 * Required body: { data: { type: "asset", access: "public"|"secure", name: "...", asset_ids: [...] } }
 */
const createReviewLink = async (assetId, options = {}) => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    if (tokenType === "oauth") {
      // V4 API: Create a share using the correct endpoint and format
      // See: https://next.developer.frame.io/platform/v4/api-reference/shares/create
      const accountsResponse = await client.get("/accounts");
      const accounts = accountsResponse.data?.data || accountsResponse.data || [];
      const accountId = accounts[0]?.id;

      if (!accountId) {
        throw new Error("No Frame.io account found");
      }

      // Try configured project first, then iterate through all projects
      const projectsToTry = [];
      if (config.frameio.projectId) {
        projectsToTry.push({ id: config.frameio.projectId, name: "configured" });
      }

      // Get all projects as fallback
      const allProjects = await getProjects();
      for (const p of allProjects) {
        if (p.id !== config.frameio.projectId) {
          projectsToTry.push(p);
        }
      }

      for (const project of projectsToTry) {
        try {
          console.log(`🔗 Creating V4 share for asset ${assetId} in project ${project.name} (${project.id})`);

          // V4 API requires: type="asset", access="public" or "secure", name, asset_ids
          const response = await client.post(`/accounts/${accountId}/projects/${project.id}/shares`, {
            data: {
              type: "asset",
              access: "public",
              name: options.name || "Video Review",
              asset_ids: [assetId],
              downloading_enabled: true,
            }
          });

          const share = response.data?.data || response.data;
          console.log(`✅ V4 share created successfully!`);
          console.log(`   Share ID: ${share.id}`);
          console.log(`   Short URL: ${share.short_url}`);

          // Construct embed URL from short_url
          // Frame.io short URLs (f.io/xxx) can be embedded directly
          const embedUrl = share.short_url;

          return {
            id: share.id,
            short_url: share.short_url,
            url: share.short_url,
            embed_url: embedUrl,
          };
        } catch (projErr) {
          const errDetail = projErr.response?.data?.errors?.[0]?.detail || projErr.message;
          console.log(`   ❌ Project ${project.name} failed: ${projErr.response?.status} - ${errDetail}`);
          // Continue to next project
        }
      }

      // If all projects failed, return a fallback with direct embed URL
      console.log("⚠️ Could not create V4 share in any project - using direct embed URL");
      return {
        id: assetId,
        short_url: `https://next.frame.io/view/${assetId}`,
        url: `https://next.frame.io/view/${assetId}`,
        embed_url: `https://next.frame.io/embed/${assetId}`,
        note: "Embed may require Frame.io login",
      };
    }

    // V2 API
    const response = await client.post(`/assets/${assetId}/review_links`, {
      name: options.name || "Video Review",
      allow_approvals: options.allowApprovals ?? true,
      notify_on_view: options.notifyOnView ?? false,
      current_version_only: options.currentVersionOnly ?? true,
      ...options,
    });
    return response.data;
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to create review link: ${error.message}`
    );
  }
};

/**
 * Get existing review links for an asset
 */
const getReviewLinks = async (assetId) => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    if (tokenType === "oauth") {
      // V4: Return direct embed URL as fallback
      return [{
        id: assetId,
        short_url: `https://next.frame.io/view/${assetId}`,
        embed_url: `https://next.frame.io/embed/${assetId}`,
      }];
    }

    // V2 API
    const response = await client.get(`/assets/${assetId}/review_links`);
    return response.data;
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to get review links: ${error.message}`
    );
  }
};

/**
 * Get or create links for an asset
 * Returns both an embed URL (presentation link, no comments) and a review URL (for commenting)
 *
 * Frame.io embedding limitation: Comments don't work in iframes due to browser security.
 * Solution: Use presentation link for embedding (no comment UI), review link for commenting in new tab.
 */
const getOrCreateReviewLink = async (assetId, assetName = "Video Review") => {
  try {
    // For V4 API, always create a new share to get a short_url
    // Existing review links API doesn't work well with V4
    const { tokenType } = await getAccessToken();

    if (tokenType === "oauth") {
      // Create a share link which provides an embeddable short_url
      const newLink = await createReviewLink(assetId, { name: assetName });
      const shortUrl = newLink.short_url || newLink.url;

      // Frame.io f.io short URLs can be embedded directly as iframes
      // Example: https://f.io/abc123 embedded in iframe
      // Note: For V4, commenting in iframes still doesn't work, but we use same URL
      // Users can click "Comment" button to open in new tab where it works
      return {
        id: newLink.id,
        url: shortUrl,           // Review URL for commenting (opens in new tab)
        embedUrl: shortUrl,      // Embed URL (same for V4, comments don't work in iframe anyway)
        name: assetName,
        created: true,
      };
    }

    // V2 API: Try to create a presentation link for embedding (no comment UI)
    // and a review link for commenting in new tab
    let embedUrl = null;
    let reviewUrl = null;

    // Try to create presentation link for embedding (view-only, no comments UI)
    const presentationLink = await createPresentationLink(assetId, { name: assetName });
    if (presentationLink) {
      embedUrl = presentationLink.url;
      console.log(`📺 Using presentation link for embedding: ${embedUrl}`);
    }

    // Check for existing review links or create one
    const existingLinks = await getReviewLinks(assetId);

    if (existingLinks && existingLinks.length > 0) {
      const reviewLink = existingLinks[0];
      reviewUrl = reviewLink.short_url || reviewLink.url;

      // If no presentation link, use review link for embed (comments won't work anyway)
      if (!embedUrl) {
        embedUrl = reviewLink.embed_url || (reviewUrl ? `${reviewUrl}?embed=true` : null);
      }

      return {
        id: reviewLink.id,
        url: reviewUrl,          // Review URL for commenting
        embedUrl: embedUrl,      // Presentation URL for embedding (or fallback to review)
        name: reviewLink.name,
        created: false,
      };
    }

    // Create new review link
    const newLink = await createReviewLink(assetId, { name: assetName });
    reviewUrl = newLink.short_url || newLink.url;

    // If no presentation link, use review link for embed
    if (!embedUrl) {
      embedUrl = newLink.embed_url || (reviewUrl ? `${reviewUrl}?embed=true` : null);
    }

    return {
      id: newLink.id,
      url: reviewUrl,            // Review URL for commenting
      embedUrl: embedUrl,        // Presentation URL for embedding (or fallback to review)
      name: newLink.name,
      created: true,
    };
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to get or create review link: ${error.message}`
    );
  }
};

/**
 * Link a Frame.io asset to a FileMeta record
 * Works with both verified assets (via API) and unverified assets (manual linking)
 */
const linkAssetToFile = async (fileMetaId, frameioAssetId, userId) => {
  try {
    let embedUrl = null;
    let reviewLinkUrl = null;

    // Try to get asset info and create review link via API
    try {
      const asset = await getAsset(frameioAssetId);

      if (asset && asset.type !== "file" && asset.type !== "version_stack") {
        console.log(`Asset type: ${asset.type}, may not be a video`);
      }

      const reviewLink = await getOrCreateReviewLink(
        frameioAssetId,
        asset.name || "Video Review"
      );

      embedUrl = reviewLink.embedUrl;
      reviewLinkUrl = reviewLink.url;
      console.log(`✅ Verified Frame.io asset and created review link`);
    } catch (apiError) {
      // API call failed - check if frameioAssetId is actually a full URL
      console.log(`⚠️ Could not verify Frame.io asset via API: ${apiError.message}`);

      // Check if it's a Frame.io URL (various formats)
      if (frameioAssetId.includes('frame.io') || frameioAssetId.includes('f.io')) {
        let url = frameioAssetId.trim();

        // Reject non-embeddable URLs
        if (url.includes('accounts.frame.io') || url.includes('app.frame.io/login') || url.includes('settings')) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Invalid Frame.io URL. Please provide a share link (e.g., f.io/abc123 or a review link). Settings, login, and account pages cannot be embedded.'
          );
        }

        // Handle f.io short links - these are embeddable directly
        if (url.includes('f.io/')) {
          embedUrl = url;
          reviewLinkUrl = url;
          console.log(`📝 Using f.io short link: ${embedUrl}`);
        }
        // Handle next.frame.io/project/.../view/... URLs
        else if (url.includes('next.frame.io') && url.includes('/view/')) {
          // Extract the view ID and share token
          const viewMatch = url.match(/\/view\/([a-zA-Z0-9-]+)/);
          const shareMatch = url.match(/[?&]share=([a-zA-Z0-9-]+)/);

          if (viewMatch) {
            const viewId = viewMatch[1];
            const shareToken = shareMatch ? shareMatch[1] : null;

            // Construct embed URL
            if (shareToken) {
              embedUrl = `https://next.frame.io/embed/${viewId}?share=${shareToken}`;
            } else {
              embedUrl = `https://next.frame.io/embed/${viewId}`;
            }
            reviewLinkUrl = url;
            console.log(`📝 Converted next.frame.io view URL to embed: ${embedUrl}`);
          } else {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              'Invalid next.frame.io URL format. Please use a share link with a view ID.'
            );
          }
        }
        // Handle next.frame.io /embed/ URLs (already embeddable)
        else if (url.includes('next.frame.io') && url.includes('/embed/')) {
          embedUrl = url;
          reviewLinkUrl = url.replace('/embed/', '/view/');
          console.log(`📝 Using next.frame.io embed URL directly: ${embedUrl}`);
        }
        // Handle /reviews/ links
        else if (url.includes('/reviews/')) {
          embedUrl = url.includes('?') ? `${url}&embed=true` : `${url}?embed=true`;
          reviewLinkUrl = url.replace('?embed=true', '').replace('&embed=true', '');
        }
        // Handle /player/ links
        else if (url.includes('/player/')) {
          embedUrl = url.replace('/player/', '/embed/');
          reviewLinkUrl = url;
        }
        // Handle /presentation/ links
        else if (url.includes('/presentation/')) {
          embedUrl = url;
          reviewLinkUrl = url;
        }
        // Unknown format - provide helpful error
        else {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Unrecognized Frame.io URL format. Please use one of these formats:\n' +
            '• f.io short link (https://f.io/abc123)\n' +
            '• Review link (https://next.frame.io/project/.../view/...?share=...)\n' +
            '• Player link (https://app.frame.io/player/...)\n' +
            '• Embed link (https://next.frame.io/embed/...)'
          );
        }

        console.log(`📝 Frame.io embed URL: ${embedUrl}`);
      } else {
        // It's just an asset ID - we can't embed without a review link
        console.log(`⚠️ Asset ID provided but no API access to create review link`);
        console.log(`💡 User should provide a full Frame.io share link instead`);

        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Please provide a full Frame.io share link (not just an asset ID). ' +
          'Go to Frame.io, open your video, click Share, and copy the link.'
        );
      }
    }

    const fileMeta = await FileMeta.findByIdAndUpdate(
      fileMetaId,
      {
        frameioAssetId,
        frameioReviewLink: reviewLinkUrl,
        frameioEmbedUrl: embedUrl,
        frameioLinkedAt: new Date(),
        frameioLinkedBy: userId,
      },
      { new: true }
    );

    if (!fileMeta) {
      throw new ApiError(httpStatus.NOT_FOUND, "File not found");
    }

    return fileMeta;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to link asset: ${error.message}`
    );
  }
};

/**
 * Unlink a Frame.io asset from a FileMeta record
 */
const unlinkAssetFromFile = async (fileMetaId) => {
  try {
    const fileMeta = await FileMeta.findByIdAndUpdate(
      fileMetaId,
      {
        frameioAssetId: null,
        frameioReviewLink: null,
        frameioEmbedUrl: null,
        frameioLinkedAt: null,
        frameioLinkedBy: null,
      },
      { new: true }
    );

    if (!fileMeta) {
      throw new ApiError(httpStatus.NOT_FOUND, "File not found");
    }

    return fileMeta;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to unlink asset: ${error.message}`
    );
  }
};

/**
 * Get Frame.io link status for a file
 * Also triggers auto-upload for unlinked video files
 */
const getFrameioStatus = async (fileMetaId) => {
  try {
    const fileMeta = await FileMeta.findById(fileMetaId);

    if (!fileMeta) {
      throw new ApiError(httpStatus.NOT_FOUND, "File not found");
    }

    // Check if Frame.io is authorized before attempting auto-upload
    const authorized = isAuthorized();
    const autoUploadEnabled = config.frameio.autoUpload === true || config.frameio.autoUpload === "true";

    // Check if we can actually auto-upload (have a valid project)
    let canAutoUpload = false;
    if (autoUploadEnabled && authorized) {
      try {
        const rootId = await getUploadParentId();
        canAutoUpload = !!rootId;
      } catch {
        canAutoUpload = false;
      }
    }

    // If video is not linked and can auto-upload, trigger it
    if (
      canAutoUpload &&
      !fileMeta.frameioAssetId &&
      fileMeta.contentType &&
      fileMeta.contentType.startsWith("video/") &&
      !autoUploadInProgress.has(fileMetaId) &&
      !autoUploadFailed.has(fileMetaId)
    ) {
      autoUploadInProgress.add(fileMetaId);

      const gcpFilePath = fileMeta.fullPath || `shoots/${fileMeta.path}`;

      console.log(`🔄 Triggering auto-upload for video: ${fileMeta.name}`);

      autoUploadAndLink(
        gcpFilePath,
        fileMeta.name,
        fileMeta.size || 0,
        fileMetaId,
        fileMeta.userId,
        fileMeta.contentType || "video/mp4"
      )
        .then((result) => {
          autoUploadInProgress.delete(fileMetaId);
          if (!result) {
            autoUploadFailed.add(fileMetaId);
          }
        })
        .catch((err) => {
          autoUploadInProgress.delete(fileMetaId);
          autoUploadFailed.add(fileMetaId);
          console.error("Auto-upload failed:", err.message);
        });
    }

    return {
      isLinked: !!fileMeta.frameioAssetId,
      uploadInProgress: autoUploadInProgress.has(fileMetaId),
      uploadFailed: autoUploadFailed.has(fileMetaId),
      autoUploadEnabled,
      canAutoUpload,
      isAuthorized: authorized,
      frameioAssetId: fileMeta.frameioAssetId,
      frameioReviewLink: fileMeta.frameioReviewLink,
      frameioEmbedUrl: fileMeta.frameioEmbedUrl,
      frameioLinkedAt: fileMeta.frameioLinkedAt,
      frameioLinkedBy: fileMeta.frameioLinkedBy,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get Frame.io status: ${error.message}`
    );
  }
};

/**
 * Test Frame.io API connection
 */
const testConnection = async () => {
  try {
    const authorized = isAuthorized();
    const usingOAuth = isOAuthConnected();
    const autoUploadEnabled = config.frameio.autoUpload === true || config.frameio.autoUpload === "true";

    if (!authorized) {
      return {
        success: false,
        message: "Frame.io not configured. Set FRAMEIO_TOKEN or use Adobe OAuth.",
        isAuthorized: false,
        hasDevToken: !!config.frameio.token,
        hasOAuth: usingOAuth,
        autoUploadEnabled,
        oauthUrl: config.frameio.adobeClientId ? "/v1/frameio/oauth/authorize" : null,
      };
    }

    const { tokenType, token } = await getAccessToken();
    const client = await getFrameioClient();

    let userInfo = null;

    if (tokenType === "oauth") {
      // V4 API: Get accounts list (no /me endpoint in V4)
      console.log("📡 Using V4 API - fetching accounts...");
      const accountsResponse = await client.get("/accounts");
      const accounts = accountsResponse.data?.data || accountsResponse.data || [];

      if (accounts.length > 0) {
        userInfo = {
          id: accounts[0].id,
          name: accounts[0].name || "Frame.io Account",
          email: "Connected via OAuth",
          accounts: accounts.map(a => ({ id: a.id, name: a.name }))
        };
        console.log(`✅ Found ${accounts.length} account(s)`);
      } else {
        userInfo = {
          id: "oauth-user",
          name: "OAuth Connected",
          email: "Connected via Adobe OAuth"
        };
      }
    } else {
      // V2 API: Use /me endpoint
      console.log("📡 Using V2 API - fetching user info...");
      const response = await client.get("/me");
      userInfo = {
        id: response.data.id,
        email: response.data.email,
        name: response.data.name,
      };
    }

    // Check if projects exist for auto-upload
    let canAutoUpload = false;
    let projectInfo = null;

    if (autoUploadEnabled) {
      try {
        const rootAssetId = await getUploadParentId();
        canAutoUpload = !!rootAssetId;
        projectInfo = { rootAssetId, projectId: config.frameio.projectId };
        console.log(`✅ Auto-upload ready: root_asset_id = ${rootAssetId}`);
      } catch (projectError) {
        console.log(`⚠️ Auto-upload not available: ${projectError.message}`);
        projectInfo = { error: projectError.message };
      }
    }

    return {
      success: true,
      message: `Frame.io API connection successful (${tokenType})`,
      isAuthorized: true,
      tokenType,
      hasDevToken: !!config.frameio.token,
      hasOAuth: usingOAuth,
      autoUploadEnabled,
      canAutoUpload,
      projectInfo,
      user: userInfo,
      projectId: config.frameio.projectId,
    };
  } catch (error) {
    console.error("Frame.io API Error:", error.response?.status, error.response?.data);
    return {
      success: false,
      message: `Frame.io API connection failed: ${error.message}`,
      error: error.response?.data,
      status: error.response?.status,
      hasDevToken: !!config.frameio.token,
      hasOAuth: isOAuthConnected(),
      autoUploadEnabled: config.frameio.autoUpload === true || config.frameio.autoUpload === "true",
      oauthUrl: config.frameio.adobeClientId ? "/v1/frameio/oauth/authorize" : null,
    };
  }
};

/**
 * Get projects/folders accessible to the user
 * Handles both V2 and V4 API endpoints
 */
const getProjects = async () => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    console.log(`📋 Fetching projects using ${tokenType} token...`);

    // V4 API (OAuth) uses different endpoints
    if (tokenType === "oauth") {
      console.log("🔄 Using V4 API endpoints...");

      try {
        // V4: First get accounts
        const accountsResponse = await client.get("/accounts");
        const accounts = accountsResponse.data?.data || accountsResponse.data || [];
        console.log(`📂 Found ${accounts.length} account(s)`);

        const allProjects = [];

        for (const account of accounts) {
          console.log(`\n🏢 Account: ${account.name} (${account.id})`);

          // V4: Get workspaces for this account
          try {
            const workspacesResponse = await client.get(`/accounts/${account.id}/workspaces`);
            const workspaces = workspacesResponse.data?.data || workspacesResponse.data || [];
            console.log(`   📁 Found ${workspaces.length} workspace(s)`);

            for (const workspace of workspaces) {
              try {
                // V4: Get projects in workspace
                const projectsResponse = await client.get(`/accounts/${account.id}/workspaces/${workspace.id}/projects`);
                const projects = projectsResponse.data?.data || projectsResponse.data || [];
                console.log(`      - Workspace "${workspace.name}": ${projects.length} project(s)`);

                projects.forEach(p => {
                  allProjects.push({
                    ...p,
                    account_name: account.name,
                    account_id: account.id,
                    workspace_name: workspace.name,
                    workspace_id: workspace.id,
                    // Map V4 fields to V2 format for compatibility
                    root_asset_id: p.root_folder_id || p.id,
                  });
                });
              } catch (err) {
                console.log(`      - Workspace "${workspace.name}": error`, err.response?.status, err.response?.data);
              }
            }
          } catch (wsErr) {
            console.log(`   ⚠️ Could not fetch workspaces:`, wsErr.response?.status, wsErr.response?.data);
          }
        }

        return allProjects;
      } catch (v4Error) {
        console.log("V4 accounts failed:", v4Error.response?.status, v4Error.response?.data);
        throw v4Error;
      }
    }

    // V2 API (developer token)
    const response = await client.get("/me");
    const accountId = response.data.account_id;
    console.log(`👤 Account ID: ${accountId}`);

    // Try direct account projects endpoint first
    try {
      const projectsResponse = await client.get(`/accounts/${accountId}/projects`);
      const projects = projectsResponse.data || [];
      if (projects.length > 0) {
        console.log(`✅ Found ${projects.length} projects via account endpoint`);
        return projects;
      }
    } catch (directError) {
      console.log("Direct account/projects failed, trying teams approach...", directError.response?.status);
    }

    // Fallback: Get teams first, then projects per team
    const teamsResponse = await client.get(`/accounts/${accountId}/teams`);
    const teams = teamsResponse.data || [];
    console.log(`📂 Found ${teams.length} teams`);

    const projectsPromises = teams.map(async (team) => {
      try {
        const projectsResponse = await client.get(`/teams/${team.id}/projects`);
        console.log(`   - Team "${team.name}": ${projectsResponse.data?.length || 0} projects`);
        return projectsResponse.data.map((project) => ({
          ...project,
          team_name: team.name,
          team_id: team.id,
        }));
      } catch (err) {
        console.log(`   - Team "${team.name}": error fetching projects`);
        return [];
      }
    });

    const projectsArrays = await Promise.all(projectsPromises);
    return projectsArrays.flat();
  } catch (error) {
    console.error("getProjects error:", error.response?.data || error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get Frame.io projects: ${error.message}`
    );
  }
};

// Cache the root asset ID to avoid repeated API calls
let cachedRootAssetId = null;

/**
 * Clear the cached root asset ID (useful when switching between V2/V4 or changing projects)
 */
const clearCache = () => {
  cachedRootAssetId = null;
  console.log("🗑️ Frame.io cache cleared");
};

/**
 * Get the configured project's root asset ID for uploads
 */
const getUploadParentId = async () => {
  // Return cached value if available
  if (cachedRootAssetId) {
    return cachedRootAssetId;
  }

  const projectId = config.frameio.projectId;

  if (!projectId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "FRAMEIO_PROJECT_ID not configured"
    );
  }

  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    // For V4 API, we need to go through accounts/workspaces/projects
    if (tokenType === "oauth") {
      console.log("🔄 Using V4 API to find project root folder...");

      // Search through all projects to find the one we want
      const projects = await getProjects();

      // Log available projects
      console.log(`📋 Available Frame.io V4 projects (${projects.length}):`);
      projects.forEach(p => {
        console.log(`   - ${p.name} (ID: ${p.id}, root_folder_id: ${p.root_folder_id || p.root_asset_id})`);
      });

      // Find by project ID
      const targetProject = projects.find(p => p.id === projectId);
      if (targetProject) {
        cachedRootAssetId = targetProject.root_folder_id || targetProject.root_asset_id || targetProject.id;
        console.log(`📁 Found project: ${targetProject.name}, root: ${cachedRootAssetId}`);
        return cachedRootAssetId;
      }

      // If project ID not found, use the first available project
      if (projects.length > 0) {
        const firstProject = projects[0];
        cachedRootAssetId = firstProject.root_folder_id || firstProject.root_asset_id || firstProject.id;
        console.log(`📁 Using first available V4 project: ${firstProject.name} (${cachedRootAssetId})`);
        console.log(`⚠️ Consider updating FRAMEIO_PROJECT_ID to: ${firstProject.id}`);
        return cachedRootAssetId;
      }

      throw new ApiError(httpStatus.NOT_FOUND, "No Frame.io projects found. Please create a project in Frame.io first.");
    }

    // V2 API: First, try to get project directly
    try {
      const response = await client.get(`/projects/${projectId}`);
      if (response.data.root_asset_id) {
        cachedRootAssetId = response.data.root_asset_id;
        console.log(`📁 Got root asset ID from project: ${cachedRootAssetId}`);
        return cachedRootAssetId;
      }
    } catch (directError) {
      console.log("Direct project lookup failed, trying through teams...");
    }

    // If direct lookup fails, search through all projects
    const projects = await getProjects();

    // Log available projects to help user configure correct one
    console.log(`📋 Available Frame.io projects (${projects.length}):`);
    projects.forEach(p => {
      console.log(`   - ${p.name} (ID: ${p.id}, root_asset_id: ${p.root_asset_id})`);
    });

    const targetProject = projects.find(p => p.id === projectId);

    if (targetProject && targetProject.root_asset_id) {
      cachedRootAssetId = targetProject.root_asset_id;
      console.log(`📁 Got root asset ID from projects list: ${cachedRootAssetId}`);
      return cachedRootAssetId;
    }

    // If configured project not found but we have projects, use the first one
    if (projects.length > 0 && projects[0].root_asset_id) {
      cachedRootAssetId = projects[0].root_asset_id;
      console.log(`📁 Using first available project: ${projects[0].name} (${cachedRootAssetId})`);
      console.log(`⚠️ Consider updating FRAMEIO_PROJECT_ID to: ${projects[0].id}`);
      return cachedRootAssetId;
    }

    // No projects found - try to create one
    if (projects.length === 0) {
      console.log("📝 No projects found. Attempting to create a project...");
      try {
        const meResponse = await client.get("/me");
        const accountId = meResponse.data.account_id;

        // Get teams to find one we can create a project in
        const teamsResponse = await client.get(`/accounts/${accountId}/teams`);
        const teams = teamsResponse.data || [];

        if (teams.length > 0) {
          const teamId = teams[0].id;
          console.log(`📝 Creating project in team: ${teams[0].name}`);

          const createProjectResponse = await client.post(`/teams/${teamId}/projects`, {
            name: "Beige Uploads"
          });

          const newProject = createProjectResponse.data;
          cachedRootAssetId = newProject.root_asset_id;
          console.log(`✅ Created project: ${newProject.name} (ID: ${newProject.id})`);
          console.log(`📁 Root asset ID: ${cachedRootAssetId}`);
          console.log(`💡 Update FRAMEIO_PROJECT_ID to: ${newProject.id}`);
          return cachedRootAssetId;
        }
      } catch (createError) {
        console.error("Failed to create project:", createError.response?.data || createError.message);
      }
    }

    // If still not found, the projectId might actually be the root_asset_id
    // Try to verify it's a valid asset
    try {
      const assetResponse = await client.get(`/assets/${projectId}`);
      if (assetResponse.data && assetResponse.data.type === "folder") {
        cachedRootAssetId = projectId;
        console.log(`📁 Project ID is actually a folder asset: ${cachedRootAssetId}`);
        return cachedRootAssetId;
      }
    } catch (assetError) {
      console.log("Asset lookup also failed");
    }

    throw new Error("Could not determine root asset ID for uploads");
  } catch (error) {
    console.error("Failed to get project root asset ID:", error.message);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to get Frame.io project details: ${error.message}`
    );
  }
};

/**
 * Upload file to Frame.io from a URL (GCP signed URL)
 */
const uploadFromUrl = async (sourceUrl, fileName, fileSize, parentAssetId = null, filetype = "video/mp4") => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    console.log(`📤 Creating Frame.io asset: ${fileName}`);

    let asset;

    if (tokenType === "oauth") {
      // V4 API: Different endpoint structure
      console.log("🔄 Using V4 API for file upload...");

      // Get account ID from accounts list
      const accountsResponse = await client.get("/accounts");
      const accounts = accountsResponse.data?.data || accountsResponse.data || [];

      if (accounts.length === 0) {
        throw new Error("No Frame.io accounts found");
      }

      const accountId = accounts[0].id;
      const projectId = config.frameio.projectId;

      // Get the folder ID (root folder of the project)
      const folderId = parentAssetId || await getUploadParentId();

      console.log(`📤 V4 upload to account: ${accountId}, folder: ${folderId}`);
      console.log(`📤 Source URL: ${sourceUrl.substring(0, 100)}...`);

      // V4 API: The working endpoint pattern for remote upload
      // CORRECT: /accounts/{account_id}/folders/{folder_id}/files/remote_upload
      const endpointsToTry = [
        // Pattern 1: /accounts/{account_id}/folders/{folder_id}/files/remote_upload (WORKING!)
        `/accounts/${accountId}/folders/${folderId}/files/remote_upload`,
        // Fallback patterns
        `/accounts/${accountId}/projects/${projectId}/files/remote_upload`,
        `/projects/${projectId}/files/remote_upload`,
      ];

      let uploadSuccess = false;
      let lastError = null;

      for (const endpoint of endpointsToTry) {
        try {
          console.log(`🔄 Trying V4 remote upload: POST ${endpoint}`);
          const remoteUploadResponse = await client.post(endpoint, {
            data: {
              name: fileName,
              source_url: sourceUrl,
            }
          });

          asset = remoteUploadResponse.data?.data || remoteUploadResponse.data;
          console.log(`✅ V4 remote upload succeeded via ${endpoint}: ${asset?.id}`);
          console.log(`   View URL: ${asset?.view_url}`);
          uploadSuccess = true;

          if (asset && asset.id) {
            // V4 API returns view_url which can be used for embedding
            const viewUrl = asset.view_url;
            // Convert view URL to embed URL: /view/ -> /embed/
            const embedUrl = viewUrl ? viewUrl.replace('/view/', '/embed/') : `https://next.frame.io/embed/${asset.id}`;

            return {
              assetId: asset.id,
              name: asset.name || fileName,
              viewUrl,
              embedUrl,
              projectId: asset.project_id,
            };
          }
          break;
        } catch (err) {
          console.log(`   ❌ ${endpoint} failed:`, err.response?.status, err.response?.data?.errors?.[0]?.detail || err.message);
          lastError = err;
        }
      }

      // If remote upload failed, try direct file upload approach
      if (!uploadSuccess) {
        console.log("🔄 Remote upload failed. Trying direct file creation...");

        // Download file from GCP first
        console.log(`⬇️ Downloading file from GCP...`);
        const downloadResponse = await axios.get(sourceUrl, {
          responseType: "arraybuffer",
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 300000, // 5 minute timeout
        });

        const fileBuffer = Buffer.from(downloadResponse.data);
        console.log(`⬇️ Downloaded ${fileBuffer.length} bytes`);

        // Try to create file and get upload URLs
        const createEndpoints = [
          `/accounts/${accountId}/projects/${projectId}/files`,
          `/projects/${projectId}/files`,
        ];

        for (const endpoint of createEndpoints) {
          try {
            console.log(`🔄 Trying file creation: POST ${endpoint}`);
            const createResponse = await client.post(endpoint, {
              data: {
                name: fileName,
                filesize: fileBuffer.length,
                type: "file",
                filetype: filetype,
              }
            });

            asset = createResponse.data?.data || createResponse.data;
            console.log(`✅ File created via ${endpoint}: ${asset?.id}`);

            // Check for upload URLs
            const uploadUrls = asset.upload_urls || asset.uploads || asset.presigned_urls;
            if (uploadUrls && uploadUrls.length > 0) {
              console.log(`📤 Got ${uploadUrls.length} upload URL(s), uploading chunks...`);
              const chunkSize = Math.ceil(fileBuffer.length / uploadUrls.length);

              for (let i = 0; i < uploadUrls.length; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, fileBuffer.length);
                const chunk = fileBuffer.slice(start, end);

                console.log(`⬆️ Uploading chunk ${i + 1}/${uploadUrls.length} (${chunk.length} bytes)`);

                await axios.put(uploadUrls[i], chunk, {
                  headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Length": chunk.length,
                  },
                  maxBodyLength: Infinity,
                  maxContentLength: Infinity,
                });
              }

              console.log(`✅ All chunks uploaded`);
            }

            return { assetId: asset.id, name: asset.name || fileName };
          } catch (createErr) {
            console.log(`   ❌ ${endpoint} failed:`, createErr.response?.status, createErr.response?.data?.errors?.[0]?.detail || createErr.message);
            lastError = createErr;
          }
        }

        if (lastError) {
          throw lastError;
        }
      }
    } else {
      // V2 API: Use /assets/{parent_id}/children endpoint
      const uploadParentId = parentAssetId || await getUploadParentId();
      const createAssetResponse = await client.post(`/assets/${uploadParentId}/children`, {
        name: fileName,
        type: "file",
        filetype: filetype,
        filesize: fileSize,
      });

      asset = createAssetResponse.data;
    }
    console.log(`Frame.io asset created: ${asset.id}`);

    // V4 API may use different field names for upload URLs
    const uploadUrls = asset.upload_urls || asset.uploads || asset.presigned_urls;

    if (!uploadUrls || uploadUrls.length === 0) {
      // For V4 remote upload, there are no upload_urls - it's handled server-side
      console.log("No upload_urls - checking if this is a remote upload...");
      if (asset.id) {
        console.log(`✅ Asset created without manual upload needed: ${asset.id}`);
        return { assetId: asset.id, name: asset.name || fileName };
      }
      throw new Error("No upload_urls returned from Frame.io");
    }

    console.log(`📤 Got ${uploadUrls.length} upload URL(s)`);

    // Download from GCP
    console.log(`⬇️ Downloading file from GCP...`);
    const downloadResponse = await axios.get(sourceUrl, {
      responseType: "arraybuffer",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const fileBuffer = Buffer.from(downloadResponse.data);
    console.log(`⬇️ Downloaded ${fileBuffer.length} bytes`);

    // Upload chunks to Frame.io
    const chunkSize = Math.ceil(fileBuffer.length / uploadUrls.length);

    for (let i = 0; i < uploadUrls.length; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileBuffer.length);
      const chunk = fileBuffer.slice(start, end);

      console.log(`⬆️ Uploading chunk ${i + 1}/${uploadUrls.length} (${chunk.length} bytes)`);

      await axios.put(uploadUrls[i], chunk, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": chunk.length,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    }

    console.log(`✅ File uploaded to Frame.io: ${asset.id}`);

    return {
      assetId: asset.id,
      name: asset.name,
    };
  } catch (error) {
    console.error("Frame.io upload error:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });
    const errorMessage = error.response?.data?.message || error.response?.data?.errors?.[0]?.message || error.message;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to upload to Frame.io: ${errorMessage}`
    );
  }
};

/**
 * Auto-upload a video to Frame.io and link to FileMeta
 * Creates a share link for embedding after upload
 */
const autoUploadAndLink = async (gcpFilePath, fileName, fileSize, fileMetaId, userId, contentType = "video/mp4") => {
  try {
    const gcpFileService = require("./gcpFile.service");

    // Get actual file size from GCP if not provided
    let actualFileSize = Number(fileSize) || 0;
    if (!actualFileSize) {
      try {
        const [metadata] = await gcpFileService.bucket.file(gcpFilePath).getMetadata();
        actualFileSize = parseInt(metadata.size, 10) || 0;
        console.log(`📏 Got file size from GCP: ${actualFileSize} bytes`);
      } catch (metaErr) {
        console.error("Could not get file size from GCP:", metaErr.message);
      }
    }

    if (!actualFileSize) {
      throw new Error("Cannot determine file size for Frame.io upload");
    }

    // Generate signed URL to download from GCP
    const { url: signedUrl } = await gcpFileService.downloadFiles(gcpFilePath, true);

    if (!signedUrl) {
      throw new Error("Failed to generate signed URL for GCP file");
    }

    console.log(`🎬 Auto-uploading video to Frame.io: ${fileName}`);

    // Upload to Frame.io
    const uploadResult = await uploadFromUrl(signedUrl, fileName, actualFileSize, null, contentType);

    console.log(`📤 Upload result:`, JSON.stringify(uploadResult, null, 2));

    // Always create a share link for proper embedding
    // The V4 API short_url (f.io/xxx) works directly in iframes
    let embedUrl = null;
    let reviewLink = null;

    try {
      console.log(`🔗 Creating share link for asset: ${uploadResult.assetId}`);
      const reviewLinkResult = await getOrCreateReviewLink(uploadResult.assetId, fileName);
      embedUrl = reviewLinkResult.embedUrl;
      reviewLink = reviewLinkResult.url;
      console.log(`✅ Share link created: ${embedUrl}`);
    } catch (reviewErr) {
      console.log(`⚠️ Could not create share link: ${reviewErr.message}`);
      // Use view URL from upload result if available, otherwise construct fallback
      embedUrl = uploadResult.embedUrl || `https://next.frame.io/embed/${uploadResult.assetId}`;
      reviewLink = uploadResult.viewUrl || `https://next.frame.io/view/${uploadResult.assetId}`;
    }

    // Save to FileMeta directly with the embed URL
    const linkedFile = await FileMeta.findByIdAndUpdate(
      fileMetaId,
      {
        frameioAssetId: uploadResult.assetId,
        frameioReviewLink: reviewLink,
        frameioEmbedUrl: embedUrl,
        frameioLinkedAt: new Date(),
        frameioLinkedBy: userId,
      },
      { new: true }
    );

    console.log(`✅ Video auto-linked to Frame.io: ${uploadResult.assetId}`);
    console.log(`   Embed URL: ${embedUrl}`);

    return linkedFile;
  } catch (error) {
    console.error("⚠️ Frame.io auto-upload failed:", error.message);
    return null;
  }
};

/**
 * Get assets in a folder/project
 */
const getAssetsInFolder = async (parentId) => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    if (tokenType === "oauth") {
      // V4 API: Try different endpoint patterns
      console.log(`📂 V4: Getting assets in folder/project: ${parentId}`);

      const accountsResponse = await client.get("/accounts");
      const accounts = accountsResponse.data?.data || accountsResponse.data || [];
      const accountId = accounts[0]?.id;

      if (!accountId) {
        throw new Error("No Frame.io account found");
      }

      // Try multiple V4 endpoint patterns
      const endpointsToTry = [
        `/accounts/${accountId}/projects/${parentId}/assets`,
        `/projects/${parentId}/assets`,
        `/accounts/${accountId}/folders/${parentId}/assets`,
        `/folders/${parentId}/assets`,
      ];

      for (const endpoint of endpointsToTry) {
        try {
          console.log(`   Trying: GET ${endpoint}`);
          const response = await client.get(endpoint);
          const assets = response.data?.data || response.data || [];
          console.log(`   ✅ Found ${assets.length} assets`);
          return assets;
        } catch (err) {
          console.log(`   ❌ ${endpoint} failed:`, err.response?.status);
        }
      }

      // If all endpoints fail, return empty array
      console.log("   ⚠️ Could not fetch assets - returning empty array");
      return [];
    }

    // V2 API: Use /assets/{parent_id}/children
    const response = await client.get(`/assets/${parentId}/children`);
    return response.data || [];
  } catch (error) {
    console.error("getAssetsInFolder error:", error.message);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to get assets: ${error.message}`
    );
  }
};

/**
 * Create a comment on a Frame.io asset
 * V2 API: POST /assets/{asset_id}/comments
 * V4 API: POST /files/{file_id}/comments or similar
 *
 * @param {string} assetId - Frame.io asset ID
 * @param {string} text - Comment text
 * @param {number|null} timestamp - Video timestamp in seconds (optional)
 * @returns {object} Created comment
 */
const createFrameioComment = async (assetId, text, timestamp = null) => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    console.log(`💬 Creating Frame.io comment on asset: ${assetId}`);
    console.log(`   Text: ${text.substring(0, 50)}...`);
    console.log(`   Timestamp: ${timestamp !== null ? timestamp + 's' : 'none'}`);

    const commentData = {
      text: text,
    };

    // Add timestamp if provided (in seconds)
    if (timestamp !== null && timestamp >= 0) {
      commentData.timestamp = timestamp;
    }

    if (tokenType === "oauth") {
      // V4 API: Try different endpoint patterns
      const endpointsToTry = [
        `/assets/${assetId}/comments`,
        `/files/${assetId}/comments`,
      ];

      for (const endpoint of endpointsToTry) {
        try {
          console.log(`   Trying: POST ${endpoint}`);
          const response = await client.post(endpoint, { data: commentData });
          const comment = response.data?.data || response.data;
          console.log(`   ✅ Comment created: ${comment.id}`);
          return {
            id: comment.id,
            text: comment.text,
            timestamp: comment.timestamp,
            createdAt: comment.created_at || comment.inserted_at,
          };
        } catch (err) {
          console.log(`   ❌ ${endpoint} failed:`, err.response?.status, err.response?.data?.errors?.[0]?.detail);
        }
      }

      throw new Error("Could not create comment via V4 API");
    }

    // V2 API: POST /assets/{asset_id}/comments
    const response = await client.post(`/assets/${assetId}/comments`, commentData);
    const comment = response.data;

    console.log(`✅ Frame.io comment created: ${comment.id}`);

    return {
      id: comment.id,
      text: comment.text,
      timestamp: comment.timestamp,
      createdAt: comment.inserted_at,
    };
  } catch (error) {
    console.error("createFrameioComment error:", error.message);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to create Frame.io comment: ${error.message}`
    );
  }
};

/**
 * Get comments from Frame.io for an asset
 * V2 API: GET /assets/{asset_id}/comments
 * V4 API: GET /files/{file_id}/comments or similar
 */
const getFrameioComments = async (assetId) => {
  try {
    const { tokenType } = await getAccessToken();
    const client = await getFrameioClient();

    console.log(`💬 Fetching Frame.io comments for asset: ${assetId}`);

    if (tokenType === "oauth") {
      // V4 API: Try different endpoint patterns
      const accountsResponse = await client.get("/accounts");
      const accounts = accountsResponse.data?.data || accountsResponse.data || [];
      const accountId = accounts[0]?.id;

      const endpointsToTry = [
        `/files/${assetId}/comments`,
        `/assets/${assetId}/comments`,
        accountId ? `/accounts/${accountId}/files/${assetId}/comments` : null,
      ].filter(Boolean);

      for (const endpoint of endpointsToTry) {
        try {
          console.log(`   Trying: GET ${endpoint}`);
          const response = await client.get(endpoint);
          const comments = response.data?.data || response.data || [];
          console.log(`   ✅ Found ${comments.length} comments`);

          // Transform V4 comments to standard format
          return comments.map(c => ({
            id: c.id,
            text: c.text || c.content || c.body || "",
            timestamp: c.timestamp || c.timecode || null,
            createdAt: c.created_at || c.inserted_at || new Date().toISOString(),
            updatedAt: c.updated_at || c.created_at || new Date().toISOString(),
            user: {
              id: c.owner_id || c.user_id || c.author?.id,
              name: c.owner?.name || c.user?.name || c.author?.name || "Frame.io User",
              email: c.owner?.email || c.user?.email || c.author?.email || "",
            },
            replies: c.replies || [],
          }));
        } catch (err) {
          console.log(`   ❌ ${endpoint} failed:`, err.response?.status);
        }
      }

      return [];
    }

    // V2 API: Use /assets/{asset_id}/comments
    const response = await client.get(`/assets/${assetId}/comments`);
    const comments = response.data || [];

    console.log(`✅ Found ${comments.length} Frame.io comments`);

    // Transform V2 comments to standard format
    return comments.map(c => ({
      id: c.id,
      text: c.text || "",
      timestamp: c.timestamp || null, // in seconds
      createdAt: c.inserted_at || new Date().toISOString(),
      updatedAt: c.updated_at || c.inserted_at || new Date().toISOString(),
      user: {
        id: c.owner_id || c.owner?.id,
        name: c.owner?.name || "Frame.io User",
        email: c.owner?.email || "",
      },
      replies: (c.replies || []).map(r => ({
        id: r.id,
        text: r.text || "",
        timestamp: r.timestamp || null,
        createdAt: r.inserted_at || new Date().toISOString(),
        user: {
          id: r.owner_id || r.owner?.id,
          name: r.owner?.name || "Frame.io User",
          email: r.owner?.email || "",
        },
      })),
    }));
  } catch (error) {
    console.error("getFrameioComments error:", error.message);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to get Frame.io comments: ${error.message}`
    );
  }
};

/**
 * Sync Frame.io comments to local database
 * Fetches comments from Frame.io and saves them to FileComment collection
 */
const syncFrameioComments = async (fileMetaId, userId) => {
  try {
    const FileComment = require("../models/fileComment.model");
    const fileMeta = await FileMeta.findById(fileMetaId);

    if (!fileMeta || !fileMeta.frameioAssetId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "File not linked to Frame.io");
    }

    // Get comments from Frame.io
    const frameioComments = await getFrameioComments(fileMeta.frameioAssetId);

    console.log(`🔄 Syncing ${frameioComments.length} Frame.io comments to local DB`);

    const savedComments = [];
    const skippedComments = [];

    for (const fComment of frameioComments) {
      // Check if comment already exists (by Frame.io comment ID)
      const existingComment = await FileComment.findOne({
        frameioCommentId: fComment.id,
      });

      if (existingComment) {
        skippedComments.push(fComment.id);
        continue;
      }

      // Create new comment in our database
      const newComment = await FileComment.create({
        fileMetaId: fileMetaId,
        userId: userId, // Use current user as owner since we can't map Frame.io users
        comment: fComment.text || "",
        timestamp: fComment.timestamp || null,
        frameioCommentId: fComment.id,
        frameioSyncedAt: new Date(),
      });

      savedComments.push(newComment);

      // Also sync replies
      if (fComment.replies && fComment.replies.length > 0) {
        for (const reply of fComment.replies) {
          const existingReply = await FileComment.findOne({
            frameioCommentId: reply.id,
          });

          if (!existingReply) {
            await FileComment.create({
              fileMetaId: fileMetaId,
              userId: userId,
              comment: reply.text || "",
              timestamp: reply.timestamp || null,
              frameioCommentId: reply.id,
              frameioSyncedAt: new Date(),
              parentId: newComment._id,
            });
          }
        }
      }
    }

    console.log(`✅ Saved ${savedComments.length} new comments, skipped ${skippedComments.length} existing`);

    return {
      fileMetaId,
      frameioAssetId: fileMeta.frameioAssetId,
      comments: savedComments,
      skipped: skippedComments.length,
      syncedAt: new Date(),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to sync Frame.io comments: ${error.message}`
    );
  }
};

module.exports = {
  // OAuth functions
  getAuthorizationUrl,
  exchangeCodeForToken,
  isAuthorized,
  // Asset functions
  getAsset,
  getAssetsInFolder,
  createReviewLink,
  getReviewLinks,
  getOrCreateReviewLink,
  linkAssetToFile,
  unlinkAssetFromFile,
  getFrameioStatus,
  testConnection,
  getProjects,
  // Upload functions
  uploadFromUrl,
  autoUploadAndLink,
  clearFailedStatus,
  clearCache,
  // Comments functions
  createFrameioComment,
  getFrameioComments,
  syncFrameioComments,
};
