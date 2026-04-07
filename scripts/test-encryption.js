/**
 * Test Encryption System
 *
 * This script helps you test and verify the encryption system is working correctly.
 *
 * Run: node scripts/test-encryption.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const ChatMessage = require('../src/models/chatMessage.model');
const ChatRoom = require('../src/models/chatRoom.model');
const User = require('../src/models/user.model');

async function testEncryption() {
  try {
    console.log('🧪 Starting Encryption Test...\n');
    console.log('='.repeat(80));

    // Connect to database
    console.log('\n📡 Connecting to database...');
    const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      console.error('❌ No MongoDB connection string found in .env');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database');

    // Test 1: Check users have encryption enabled
    console.log('\n' + '='.repeat(80));
    console.log('TEST 1: Check Users Have Encryption Enabled');
    console.log('='.repeat(80));

    const usersWithEncryption = await User.find({
      'e2e_encryption.enabled': true
    }).select('name email e2e_encryption.enabled');

    console.log(`\n✅ Found ${usersWithEncryption.length} users with encryption enabled:`);
    usersWithEncryption.forEach(user => {
      console.log(`   - ${user.name} (${user.email})`);
    });

    const usersWithoutEncryption = await User.find({
      $or: [
        { 'e2e_encryption.enabled': { $ne: true } },
        { 'e2e_encryption.enabled': { $exists: false } }
      ]
    }).select('name email');

    if (usersWithoutEncryption.length > 0) {
      console.log(`\n⚠️  Found ${usersWithoutEncryption.length} users WITHOUT encryption:`);
      usersWithoutEncryption.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
      });
      console.log('\n💡 These users need to set up encryption in the frontend first!');
    }

    // Test 2: Check chat rooms have encryption enabled
    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: Check Chat Rooms Have Encryption');
    console.log('='.repeat(80));

    const encryptedRooms = await ChatRoom.find({
      'encryption.enabled': true
    }).select('name encryption');

    console.log(`\n✅ Found ${encryptedRooms.length} encrypted chat rooms:`);
    for (const room of encryptedRooms) {
      const participantCount = room.encryption?.participant_keys?.length || 0;
      console.log(`   - Room ${room._id} (${room.name || 'Unnamed'})`);
      console.log(`     Participants with keys: ${participantCount}`);
    }

    const unencryptedRooms = await ChatRoom.find({
      $or: [
        { 'encryption.enabled': { $ne: true } },
        { 'encryption.enabled': { $exists: false } }
      ]
    }).select('name');

    if (unencryptedRooms.length > 0) {
      console.log(`\n⚠️  Found ${unencryptedRooms.length} rooms WITHOUT encryption`);
      console.log('💡 New rooms should automatically get encryption when created');
    }

    // Test 3: Check recent encrypted messages
    console.log('\n' + '='.repeat(80));
    console.log('TEST 3: Check Recent Encrypted Messages');
    console.log('='.repeat(80));

    const recentEncrypted = await ChatMessage.find({
      is_encrypted: true
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    if (recentEncrypted.length === 0) {
      console.log('\n⚠️  No encrypted messages found in database yet');
      console.log('💡 Send a test message in the frontend to verify encryption works');
    } else {
      console.log(`\n✅ Found ${recentEncrypted.length} recent encrypted messages:`);
      recentEncrypted.forEach((msg, index) => {
        console.log(`\n   Message ${index + 1}:`);
        console.log(`   - ID: ${msg._id}`);
        console.log(`   - Room: ${msg.chat_room_id}`);
        console.log(`   - Plaintext (should be empty): "${msg.message}"`);
        console.log(`   - Encrypted: ${!!msg.encrypted_content?.ciphertext}`);
        console.log(`   - Ciphertext length: ${msg.encrypted_content?.ciphertext?.length || 0} chars`);
        console.log(`   - IV length: ${msg.encrypted_content?.iv?.length || 0} chars`);
        console.log(`   - Algorithm: ${msg.encrypted_content?.algorithm || 'N/A'}`);

        // Validation checks
        const issues = [];
        if (msg.message) issues.push('⚠️ Message has plaintext (should be empty for E2E)');
        if (!msg.encrypted_content?.ciphertext) issues.push('❌ Missing ciphertext');
        if (!msg.encrypted_content?.iv) issues.push('❌ Missing IV');
        if (msg.encrypted_content?.iv && msg.encrypted_content.iv.length !== 16) {
          issues.push('⚠️ IV wrong length (should be 16 base64 chars)');
        }

        if (issues.length > 0) {
          console.log(`\n   🔴 ISSUES:`);
          issues.forEach(issue => console.log(`      ${issue}`));
        } else {
          console.log(`   ✅ Structure looks valid`);
        }
      });
    }

    // Test 4: Check legacy messages
    console.log('\n' + '='.repeat(80));
    console.log('TEST 4: Check Legacy Messages');
    console.log('='.repeat(80));

    const legacyMessages = await ChatMessage.find({
      message: { $regex: /Legacy encrypted message/i }
    }).countDocuments();

    console.log(`\n✅ Found ${legacyMessages} legacy encrypted messages`);
    console.log('💡 These are old messages that were converted to readable format');

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Users with encryption: ${usersWithEncryption.length}`);
    console.log(`⚠️  Users without encryption: ${usersWithoutEncryption.length}`);
    console.log(`✅ Encrypted rooms: ${encryptedRooms.length}`);
    console.log(`⚠️  Unencrypted rooms: ${unencryptedRooms.length}`);
    console.log(`✅ Recent encrypted messages: ${recentEncrypted.length}`);
    console.log(`✅ Legacy messages: ${legacyMessages}`);

    console.log('\n' + '='.repeat(80));
    console.log('🎯 HOW TO TEST:');
    console.log('='.repeat(80));
    console.log('1. Login to frontend with: admin@gmail.com / password1');
    console.log('2. Open any chat room');
    console.log('3. Send a test message: "Test encryption 🔐"');
    console.log('4. Run this script again to verify the message is encrypted in DB');
    console.log('5. Check the other user can see and read the decrypted message');
    console.log('\n✅ Test complete!\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testEncryption();
