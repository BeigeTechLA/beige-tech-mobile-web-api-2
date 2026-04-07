# Database Migrations

This directory contains database migration scripts for the project.

## Meeting End Time Migration

### Purpose
This migration adds `meeting_end_time` to all existing meetings in the database that don't have it set.

### When to Run
Run this migration once after deploying the meeting duration feature.

### How to Run

1. **Navigate to the API directory:**
   ```bash
   cd /Users/luminouslabs/Desktop/project/Project\ /api
   ```

2. **Run the migration script:**
   ```bash
   node src/migrations/add-meeting-end-time.js
   ```

3. **Verify the output:**
   - The script will show how many meetings were found
   - It will update them with appropriate end times based on meeting type:
     - `pre_production` meetings: +60 minutes (1 hour)
     - `post_production` meetings: +30 minutes
   - You should see a success message when complete

### What it Does
- Finds all meetings without `meeting_end_time` set
- Calculates an appropriate end time based on:
  - Start time (`meeting_date_time`)
  - Meeting type (`meeting_type`)
- Updates each meeting with the calculated end time
- The backend will then calculate the duration automatically

### Safety
- The migration is safe to run multiple times
- It only updates meetings that don't have `meeting_end_time` set
- Existing meetings with end times are not modified

### After Migration
- New meetings will show the correct duration based on the start and end times entered
- Old meetings will show durations based on their meeting type (1 hour or 30 minutes)
- You can edit any meeting to set a custom duration
