/**
 * Script to fix old encrypted messages that cannot be decrypted
 *
 * Options:
 * 1. Mark as legacy (recommended) - changes them to plaintext "[Legacy encrypted message]"
 * 2. Delete them completely
 *
 * Run: node scripts/fix-encrypted-messages.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const ChatMessage = require('../src/models/chatMessage.model');

async function fixEncryptedMessages(option = 'mark-legacy') {
  try {
    console.log('🔧 Connecting to database...');
    const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      console.error('❌ No MongoDB connection string found in .env');
      console.error('   Looking for: MONGODB_URL, MONGODB_URI, or DATABASE_URL');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database');

    // Find all encrypted messages
    const encryptedMessages = await ChatMessage.find({ is_encrypted: true });
    console.log(`📊 Found ${encryptedMessages.length} encrypted messages`);

    if (option === 'mark-legacy') {
      // Option 1: Mark as legacy messages (recommended)
      console.log('🔄 Marking messages as legacy...');

      const result = await ChatMessage.updateMany(
        { is_encrypted: true },
        {
          $set: {
            message: '[Legacy encrypted message - cannot be decrypted]',
            is_encrypted: false,
            encrypted_content: null,
            encrypted_file_name: null,
          }
        }
      );

      console.log(`✅ Updated ${result.modifiedCount} messages to legacy format`);

    } else if (option === 'delete') {
      // Option 2: Delete old encrypted messages
      console.log('🗑️  Deleting encrypted messages...');

      const result = await ChatMessage.deleteMany({ is_encrypted: true });

      console.log(`✅ Deleted ${result.deletedCount} encrypted messages`);
    }

    console.log('✅ Migration complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Get option from command line argument
const option = process.argv[2] || 'mark-legacy'; // 'mark-legacy' or 'delete'

if (!['mark-legacy', 'delete'].includes(option)) {
  console.error('❌ Invalid option. Use: mark-legacy or delete');
  console.log('Example: node scripts/fix-encrypted-messages.js mark-legacy');
  process.exit(1);
}

console.log(`Running migration with option: ${option}`);
fixEncryptedMessages(option);
