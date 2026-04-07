# Folder Counts API Fix - User Access Control

## Problem Statement

The `/v1/gcp/folder-counts/:userId/:folderPath` API endpoint was showing incorrect file counts for users with the **"user"** role. 

### Issue Details:
- **Admin/PM roles**: ✅ Correctly showed ALL files in the folder
- **User role**: ❌ **BUG** - Showed ALL files instead of only the files they uploaded

### Root Cause:
The `getFolderCounts` function was:
1. Applying access control filters when fetching files from MongoDB (FileMeta)
2. BUT when categorizing and counting files, it counted ALL fetched files regardless of ownership
3. If GCS fallback was used, it would fetch ALL files without any user filtering at all

## Solution Implemented

### Changes Made to `src/services/gcpFile.service.js`:

#### 1. **Added User Access Verification Helper Function**
```javascript
const userHasAccessToFile = (file) => {
  if (isAdmin) return true; // Admins see everything
  
  const userIdStr = userId?.toString();
  const fileUserId = file.userId?.toString();
  
  // Check if file belongs to user
  if (fileUserId === userIdStr) return true;
  
  // Check if user is in cpIds array
  if (file.metadata?.cpIds) {
    const cpIds = Array.isArray(file.metadata.cpIds) ? file.metadata.cpIds : [];
    // Check for string match or object format { id: userId }
    // ... validation logic
  }
  
  return false;
};
```

#### 2. **Updated FileMeta Query to Include User Data**
- Changed: `.select('path mimeType contentType size')`
- To: `.select('path mimeType contentType size userId metadata')`
- This ensures we have the ownership data needed for access control

#### 3. **Restricted GCS Fallback to Admin Only**
```javascript
// GCS fallback now only works for admin roles
if (allFiles.length === 0 && bucket && isAdmin) {
  // Fetch from GCS...
} else if (allFiles.length === 0 && !isAdmin) {
  console.log('⚠️ No files found in FileMeta for non-admin user. GCS fallback disabled.');
}
```

**Rationale**: GCS doesn't have user ownership metadata, so we can't properly filter files. For non-admin users, we must rely on FileMeta (MongoDB) which has `userId` and `metadata.cpIds` fields.

#### 4. **Added Per-File Access Check in Counting Loop**
```javascript
allFiles.forEach(file => {
  // Verify access for each file
  if (!isAdmin && !userHasAccessToFile(file)) {
    console.log(`⚠️ Skipping file (no access): ${file.path}`);
    return; // Skip this file
  }
  
  // Count this file as accessible
  counts.rootFolder.totalFiles++;
  
  // ... rest of counting logic
});
```

#### 5. **Fixed Total Files Counter**
- Changed from: `totalFiles: allFiles.length` (all fetched files)
- To: `totalFiles: 0` (initialized) and incremented only for accessible files

#### 6. **Added Detailed Logging**
```javascript
console.log(`📊 Access summary for ${role} role:`);
console.log(`   Total files fetched: ${allFiles.length}`);
console.log(`   Accessible files: ${counts.rootFolder.totalFiles}`);
console.log(`   Pre-production: ${counts['pre-production'].count}`);
console.log(`   - Raw footage: ${counts['raw-footage'].count} (HIDDEN from user)`);
// ... etc
```

## Expected Behavior After Fix

### For Admin/PM/Post-Production Manager Roles:
- ✅ Shows ALL files in the folder (no change)
- ✅ Pre-production files: ALL
- ✅ Post-production files: ALL (including raw footage)
- ✅ Work-in-progress: Raw footage + Edited footage
- ✅ Final delivery: Final deliverables

### For User Role:
- ✅ Shows ONLY files they uploaded or have access to (via cpIds)
- ✅ Pre-production files: Only their uploads
- ✅ Post-production files: Only edited footage and final deliverables they have access to
- ❌ Raw footage: **HIDDEN** - not counted or shown
- ✅ Work-in-progress: Only edited footage they have access to
- ✅ Final delivery: Only final deliverables they have access to

## Access Control Rules

### File Ownership Check:
A user has access to a file if **ANY** of these conditions are met:
1. `file.userId === userId` (they uploaded it)
2. `file.metadata.cpIds` includes `userId` (as string)
3. `file.metadata.cpIds` includes `{ id: userId }` (as object)

### Folder Visibility by Role:

| Folder | Admin | PM | User |
|--------|-------|-----|------|
| Pre-production | ✅ All files | ✅ All files | ✅ Own uploads only |
| Raw footage | ✅ All files | ✅ All files | ❌ **HIDDEN** |
| Edited footage | ✅ All files | ✅ All files | ✅ Accessible files |
| Final deliverables | ✅ All files | ✅ All files | ✅ Accessible files |

## Testing

### Test Scenario 1: User with Own Uploads
```
User ID: 664edf60caef2c061f6117ff
Folder: Sajid's shoot-raw_a098c
Files in folder:
  - preproduction/image1.jpg (userId: 664edf60caef2c061f6117ff)
  - postproduction/raw footage/video1.mp4 (userId: other_user)
  - postproduction/edited footage/edit1.mp4 (userId: 664edf60caef2c061f6117ff)
  - postproduction/final deliverables/final1.mp4 (userId: other_user, cpIds: [664edf60caef2c061f6117ff])

Expected counts for user:
  - Pre-production: 1 (image1.jpg)
  - Raw footage: 0 (hidden)
  - Edited footage: 1 (edit1.mp4)
  - Final deliverables: 1 (final1.mp4 - user has access via cpIds)
  - Work-in-progress: 1 (edit1.mp4 only)
  - Total accessible: 3 files
```

### Test Scenario 2: Admin User
```
User ID: 664edf60caef2c061f6117ff (role: admin)
Folder: Sajid's shoot-raw_a098c
Files in folder: Same as above (4 files total)

Expected counts for admin:
  - Pre-production: 1
  - Raw footage: 1
  - Edited footage: 1
  - Final deliverables: 1
  - Work-in-progress: 2 (raw + edited)
  - Total accessible: 4 files
```

## API Response Structure

```json
{
  "success": true,
  "timestamp": "2026-01-20T06:04:00.628Z",
  "user": {
    "id": "664edf60caef2c061f6117ff",
    "name": "User Name",
    "role": "user"
  },
  "folder": {
    "path": "Sajid's shoot-raw_a098c",
    "name": "Sajid's shoot-raw_a098c"
  },
  "counts": {
    "all": 3,  // ← Now shows only accessible files for user role
    "rootFolder": {
      "name": "Sajid's shoot-raw_a098c",
      "totalFiles": 3,  // ← Now shows only accessible files
      "totalSize": 1048576,
      "totalSizeFormatted": "1.00 MB"
    },
    "pre-production": {
      "count": 1,  // ← Only user's uploads
      "size": 524288,
      "types": { "images": 1 },
      "sizeFormatted": "512.00 KB"
    },
    "post-production": {
      "count": 2,  // ← Edited + Final (NO raw footage)
      "size": 524288,
      "subfolders": {
        "raw-footage": {
          "count": 0,  // ← Hidden from user role
          "size": 0,
          "types": {},
          "sizeFormatted": "0 B"
        },
        "edited-footage": {
          "count": 1,
          "size": 262144,
          "types": { "videos": 1 },
          "sizeFormatted": "256.00 KB"
        },
        "final-deliverables": {
          "count": 1,
          "size": 262144,
          "types": { "videos": 1 },
          "sizeFormatted": "256.00 KB"
        }
      },
      "sizeFormatted": "512.00 KB"
    },
    "work-in-progress": {
      "count": 1,  // ← Only edited footage (NO raw footage for user)
      "size": 262144,
      "description": "Edited Footage (work in progress)",
      "sizeFormatted": "256.00 KB"
    },
    "final-delivery": {
      "count": 1,
      "size": 262144,
      "types": { "videos": 1 },
      "sizeFormatted": "256.00 KB"
    }
  },
  "summary": {
    "totalFiles": 3,
    "preProduction": 1,
    "postProduction": 2,
    "workInProgress": 1,
    "finalDelivery": 1,
    "totalSize": "1.00 MB"
  }
}
```

## Key Improvements

1. ✅ **Accurate user-based counting**: Users now only see counts for files they have access to
2. ✅ **Proper access control**: Each file is verified before being counted
3. ✅ **Safe GCS fallback**: GCS direct access is now admin-only (no user metadata available in GCS)
4. ✅ **Better logging**: Clear visibility into what files are being counted and skipped
5. ✅ **Consistent with file listing**: Counts now match what users see in the actual file list

## Related Files Modified

- `src/services/gcpFile.service.js` - Main counting logic
  - Function: `getFolderCounts(baseFolderPath, userId, role)`
  - Lines: ~2528-2820

## Notes

- This fix assumes that all files have proper `userId` or `metadata.cpIds` fields in FileMeta
- If files are missing these fields, they won't be accessible to non-admin users
- Admin/PM roles are unaffected and will continue to see all files
- The fix maintains backward compatibility with existing permission structures

---

**Date**: January 20, 2026  
**Fixed by**: Senior Software Engineer Analysis  
**Issue**: User role seeing all folder files instead of only their own uploads  
**Status**: ✅ Resolved
