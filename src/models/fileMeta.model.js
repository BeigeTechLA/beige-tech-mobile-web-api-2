const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

/**
 * FileMeta Schema - For storing file and folder metadata
 * This schema tracks files and folders in Google Cloud Storage
 * and links them to users for access control
 */
const fileMetaSchema = new mongoose.Schema(
  {
    // File/Folder path in GCS (e.g., "my-folder/" or "my-folder/file.jpg")
    path: {
      type: String,
      required: true,
      index: true,
    },

    // File/Folder name (e.g., "file.jpg" or "my-folder")
    name: {
      type: String,
      required: true,
    },

    // User association - for filtering files by user
    // Optional because system-created folders (like production workflow folders) may not have a user
    userId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },

    // File size in bytes
    size: {
      type: Number,
      default: 0,
    },

    // Content type (e.g., "image/jpeg", "video/mp4", "folder")
    contentType: {
      type: String,
      default: "application/octet-stream",
    },

    // Folder flag - CRITICAL for distinguishing folders from files
    isFolder: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Public/Private flag
    isPublic: {
      type: Boolean,
      default: false,
    },

    // GCS generation/version
    version: {
      type: String,
    },

    // Additional metadata (orderId, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Author/Creator name
    author: {
      type: String,
    },

    // Full GCS path (with shoots/ prefix if applicable)
    fullPath: {
      type: String,
    },

    // Folder type for production workflow folders
    // Permission Matrix (User role):
    // preproduction: View ✅, Upload ✅
    // postproduction: View ✅, Upload ❌
    // postproduction_raw_footage: View ❌ (HIDDEN), Upload ❌
    // postproduction_edited_footage: View ✅, Upload ❌
    // postproduction_final_deliverables: View ✅, Upload ❌
    folderType: {
      type: String,
      enum: ['root', 'preproduction', 'postproduction', 'postproduction_raw_footage', 'postproduction_edited_footage', 'postproduction_final_deliverables', null],
      default: null,
    },

    // Parent folder reference for subfolder hierarchy
    parentFolderId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "FileMeta",
      default: null,
    },

    // Frame.io integration fields
    // Frame.io asset ID - links this file to a Frame.io asset
    frameioAssetId: {
      type: String,
      default: null,
      index: true,
    },

    // Frame.io review link URL
    frameioReviewLink: {
      type: String,
      default: null,
    },

    // Frame.io embeddable URL (review link with embed parameter)
    frameioEmbedUrl: {
      type: String,
      default: null,
    },

    // Timestamp when Frame.io asset was linked
    frameioLinkedAt: {
      type: Date,
      default: null,
    },

    // User who linked the Frame.io asset
    frameioLinkedBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Add compound indexes for efficient queries
fileMetaSchema.index({ userId: 1, path: 1 });
fileMetaSchema.index({ userId: 1, isFolder: 1 });
fileMetaSchema.index({ userId: 1, createdAt: -1 });

// Index for CP access control - allows CPs to find folders they have access to
// Simple string array format (current)
fileMetaSchema.index({ 'metadata.cpIds': 1 });
// Legacy object format for backward compatibility
fileMetaSchema.index({ 'metadata.cpIds.id': 1 });
fileMetaSchema.index({ 'metadata.orderId': 1 });

// Index for folder type filtering
fileMetaSchema.index({ folderType: 1 });
fileMetaSchema.index({ parentFolderId: 1 });

// Index for Frame.io integration
fileMetaSchema.index({ frameioAssetId: 1 });

// Add plugin that converts mongoose document to JSON format
fileMetaSchema.plugin(toJSON);

// Add plugin for pagination support
fileMetaSchema.plugin(paginate);

// Create the "FileMeta" model using the fileMeta schema
const FileMeta = mongoose.model("FileMeta", fileMetaSchema);

module.exports = FileMeta;
