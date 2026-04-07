/**
 * Diagnostic Script: Check Encrypted Messages in Database
 *
 * This script will:
 * 1. Show how many encrypted messages exist
 * 2. Show sample encrypted message structure
 * 3. Check if ciphertext and IV are valid
 * 4. Help identify why decryption is failing
 *
 * Run: node scripts/check-encrypted-messages.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const ChatMessage = require('../src/models/chatMessage.model');
const ChatRoom = require('../src/models/chatRoom.model');
const User = require('../src/models/user.model'); // Import User model to avoid populate error

async function checkEncryptedMessages() {
  try {
    console.log('🔧 Connecting to database...');
    const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      console.error('❌ No MongoDB connection string found in .env');
      console.error('   Looking for: MONGODB_URL, MONGODB_URI, or DATABASE_URL');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database\n');

    // Find all encrypted messages (without populate to avoid model issues)
    const encryptedMessages = await ChatMessage.find({ is_encrypted: true })
      .limit(10)
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for plain JavaScript objects

    console.log(`📊 Total encrypted messages: ${await ChatMessage.countDocuments({ is_encrypted: true })}\n`);

    if (encryptedMessages.length === 0) {
      console.log('✅ No encrypted messages found in database');
      process.exit(0);
    }

    console.log('🔍 Sample encrypted messages:\n');
    console.log('='.repeat(80));

    for (const msg of encryptedMessages) {
      console.log(`\n📧 Message ID: ${msg._id}`);
      console.log(`   Room ID: ${msg.chat_room_id}`);
      console.log(`   Sender ID: ${msg.sent_by || 'Unknown'}`);
      console.log(`   Created: ${msg.createdAt}`);
      console.log(`   Message Text: "${msg.message}"`);
      console.log(`   Is Encrypted: ${msg.is_encrypted}`);

      // Check encrypted_content structure
      if (msg.encrypted_content) {
        const ciphertext = msg.encrypted_content.ciphertext;
        const iv = msg.encrypted_content.iv;
        const algorithm = msg.encrypted_content.algorithm;

        console.log(`\n   📦 Encrypted Content:`);
        console.log(`      - Ciphertext Length: ${ciphertext?.length || 0} chars`);
        console.log(`      - Ciphertext Preview: ${ciphertext?.substring(0, 50)}...`);
        console.log(`      - IV Length: ${iv?.length || 0} chars`);
        console.log(`      - IV Value: ${iv || 'NULL'}`);
        console.log(`      - Algorithm: ${algorithm || 'NULL'}`);
        console.log(`      - Key Version: ${msg.encrypted_content.key_version || 'NULL'}`);

        // Validate structure
        const issues = [];
        if (!ciphertext) issues.push('❌ Missing ciphertext');
        if (!iv) issues.push('❌ Missing IV');
        if (!algorithm) issues.push('❌ Missing algorithm');
        if (ciphertext && ciphertext.length < 20) issues.push('⚠️ Ciphertext suspiciously short');
        if (iv && iv.length !== 16) issues.push('⚠️ IV should be 16 chars (base64 of 12 bytes)');

        if (issues.length > 0) {
          console.log(`\n   🔴 ISSUES DETECTED:`);
          issues.forEach(issue => console.log(`      ${issue}`));
        } else {
          console.log(`\n   ✅ Structure looks valid`);
        }
      } else {
        console.log(`\n   ❌ NO encrypted_content found (is_encrypted=true but no data!)`);
      }

      // Check file encryption
      if (msg.file_url) {
        console.log(`\n   📁 File: ${msg.file_url}`);
        console.log(`      File Name: "${msg.file_name}"`);
        if (msg.encrypted_file_name?.ciphertext) {
          console.log(`      Encrypted File Name: ${msg.encrypted_file_name.ciphertext.substring(0, 30)}...`);
        }
      }

      console.log('\n' + '-'.repeat(80));
    }

    // Group by room
    console.log('\n\n📊 Encrypted Messages by Room:\n');
    const byRoom = await ChatMessage.aggregate([
      { $match: { is_encrypted: true } },
      { $group: { _id: '$chat_room_id', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    for (const room of byRoom) {
      const roomData = await ChatRoom.findById(room._id);
      console.log(`   Room ${room._id}: ${room.count} messages (${roomData?.name || 'Unknown'})`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Diagnostic complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Check if ciphertext looks like valid base64 (not placeholder text)');
    console.log('   2. If ciphertext is short (<20 chars), encryption likely failed during send');
    console.log('   3. If IV is missing or wrong length, decryption will fail');
    console.log('   4. Run fix-encrypted-messages.js to clean up bad data\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEncryptedMessages();
