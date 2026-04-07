/**
 * Migration script to add meeting_end_time to existing meetings
 * Run this script once to update all existing meetings in the database
 *
 * Usage: node src/migrations/add-meeting-end-time.js
 */

const mongoose = require('mongoose');
const Meeting = require('../models/meeting.model');
const config = require('../config/config');

async function migrateMeetingEndTimes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('Connected to MongoDB');

    // Find all meetings without meeting_end_time
    const meetings = await Meeting.find({
      $or: [
        { meeting_end_time: { $exists: false } },
        { meeting_end_time: null }
      ]
    });

    console.log(`Found ${meetings.length} meetings without end time`);

    let updated = 0;
    for (const meeting of meetings) {
      // Calculate end time based on meeting type
      // pre_production: 1 hour (60 minutes)
      // post_production: 30 minutes
      const durationMinutes = meeting.meeting_type === 'pre_production' ? 60 : 30;

      // Add duration to meeting_date_time
      const endTime = new Date(meeting.meeting_date_time);
      endTime.setMinutes(endTime.getMinutes() + durationMinutes);

      // Update the meeting
      meeting.meeting_end_time = endTime;
      await meeting.save();

      updated++;
      if (updated % 10 === 0) {
        console.log(`Updated ${updated}/${meetings.length} meetings...`);
      }
    }

    console.log(`✓ Successfully updated ${updated} meetings with end times`);
    console.log('Migration completed!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run the migration
migrateMeetingEndTimes();
