/**
 * Re-sync Room Keys for Users
 *
 * This script fixes the issue where users can't decrypt room keys
 * because their encryption keys were regenerated after the room was created.
 *
 * Run: node scripts/resync-room-keys.js <userId>
 * Example: node scripts/resync-room-keys.js 69521f2ef51207af087a2a0b
 */

const mongoose = require('mongoose');
require('dotenv').config();

const ChatRoom = require('../src/models/chatRoom.model');
const User = require('../src/models/user.model');
const encryptionService = require('../src/services/encryption.service');

async function resyncRoomKeys(userId) {
  try {
    console.log('🔄 Re-syncing room keys for user:', userId);
    console.log('='.repeat(80));

    // Connect to database
    const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      console.error('❌ No MongoDB connection string found in .env');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database\n');

    // Check if user exists and has encryption enabled
    const user = await User.findById(userId).select('name email e2e_encryption');
    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🔐 Encryption enabled: ${user.e2e_encryption?.enabled || false}`);
    console.log(`🔑 Has public key: ${!!user.e2e_encryption?.public_key}\n`);

    if (!user.e2e_encryption?.enabled || !user.e2e_encryption?.public_key) {
      console.error('❌ User does not have encryption enabled');
      console.error('💡 User must set up encryption in the frontend first');
      process.exit(1);
    }

    // Find all rooms where this user is a participant
    const rooms = await ChatRoom.find({
      $or: [
        { client_id: userId },
        { pm_id: userId },
        { 'cp_ids.id': userId },
        { 'production_ids.id': userId },
        { 'manager_ids.id': userId },
      ],
      'encryption.enabled': true
    }).select('_id name encryption');

    console.log(`📊 Found ${rooms.length} encrypted rooms for this user\n`);

    if (rooms.length === 0) {
      console.log('✅ No encrypted rooms found - nothing to sync');
      process.exit(0);
    }

    let successCount = 0;
    let failCount = 0;
    let alreadyHasKeyCount = 0;

    for (const room of rooms) {
      console.log(`\n🔄 Processing room: ${room.name || room._id}`);

      // Check if user already has a key for this room
      const hasKey = room.encryption?.participant_keys?.some(
        pk => pk.user_id.toString() === userId.toString()
      );

      if (hasKey) {
        console.log('   ℹ️  User already has key, re-granting with current public key...');
        // Remove old key first
        room.encryption.participant_keys = room.encryption.participant_keys.filter(
          pk => pk.user_id.toString() !== userId.toString()
        );
        await room.save();
      }

      try {
        // Grant new key with current public key
        const result = await encryptionService.grantEncryptionAccess(
          room._id,
          userId,
          userId // granted by self
        );

        if (result.success) {
          if (result.alreadyHasKey) {
            console.log('   ✅ Already had valid key');
            alreadyHasKeyCount++;
          } else {
            console.log('   ✅ Successfully granted new room key');
            successCount++;
          }
        } else {
          console.log(`   ❌ Failed: ${result.reason}`);
          failCount++;
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Successfully granted: ${successCount}`);
    console.log(`ℹ️  Already had key: ${alreadyHasKeyCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total rooms: ${rooms.length}\n`);

    if (successCount > 0) {
      console.log('✅ Room keys re-synced successfully!');
      console.log('💡 User should now be able to decrypt messages');
    } else if (alreadyHasKeyCount === rooms.length) {
      console.log('ℹ️  All rooms already have valid keys');
      console.log('💡 If decryption still fails, user may need to clear browser cache/IndexedDB');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get user ID from command line
const userId = process.argv[2];

if (!userId) {
  console.error('❌ Usage: node scripts/resync-room-keys.js <userId>');
  console.error('Example: node scripts/resync-room-keys.js 69521f2ef51207af087a2a0b');
  process.exit(1);
}

resyncRoomKeys(userId);
