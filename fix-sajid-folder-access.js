/**
 * Migration script to fix file access for Sajid's folder
 * This adds Sajid's user ID to the cpIds of files in his folder
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/beige';

const FOLDER_PATH = "Sajid's shoot-raw_a098c";
const SAJID_USER_ID = '6967439b8f66af9ca11b2641'; // Sajid test

mongoose.connect(MONGODB_URL).then(async () => {
  console.log('✅ Connected to MongoDB');
  
  const FileMeta = mongoose.model('FileMeta', new mongoose.Schema({
    path: String,
    name: String,
    userId: mongoose.Schema.Types.ObjectId,
    isFolder: Boolean,
    metadata: mongoose.Schema.Types.Mixed,
    size: Number,
    contentType: String,
  }, { timestamps: true }));
  
  console.log(`\n🔧 Fixing access for folder: ${FOLDER_PATH}`);
  console.log(`👤 Adding user ID: ${SAJID_USER_ID}`);
  
  // Get all files in the folder
  const files = await FileMeta.find({
    path: new RegExp(`^${FOLDER_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i'),
    isFolder: false
  });
  
  console.log(`\n📄 Found ${files.length} files to update`);
  
  let updated = 0;
  let alreadyHasAccess = 0;
  
  for (const file of files) {
    console.log(`\n  Processing: ${file.path}`);
    
    // Check if user already has access
    const cpIds = file.metadata?.cpIds || [];
    const hasAccess = cpIds.includes(SAJID_USER_ID) ||
                     cpIds.some(cp => typeof cp === 'object' && cp.id === SAJID_USER_ID) ||
                     file.userId?.toString() === SAJID_USER_ID;
    
    if (hasAccess) {
      console.log('    ✓ User already has access');
      alreadyHasAccess++;
      continue;
    }
    
    // Add user to cpIds
    if (!file.metadata) {
      file.metadata = {};
    }
    
    if (!Array.isArray(file.metadata.cpIds)) {
      file.metadata.cpIds = [];
    }
    
    file.metadata.cpIds.push(SAJID_USER_ID);
    await file.save();
    
    console.log('    ✅ Added user to cpIds');
    updated++;
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Updated: ${updated} files`);
  console.log(`   Already had access: ${alreadyHasAccess} files`);
  console.log(`   Total: ${files.length} files`);
  
  mongoose.disconnect();
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
