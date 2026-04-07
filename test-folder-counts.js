#!/usr/bin/env node

/**
 * Test Folder Counts API
 * This script tests the enhanced folder counts functionality
 */

// Set NODE_ENV before requiring anything else
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

require('dotenv').config();
const mongoose = require('mongoose');
const { getFolderCounts } = require('./src/services/gcpFile.service');
const FileMeta = require('./src/models/fileMeta.model');

async function testFolderCounts() {
  try {
    console.log('🧪 Testing Folder Counts API\n');
    console.log('='.repeat(60));

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get a sample file to find a real folder path
    const sampleFile = await FileMeta.findOne({ isFolder: { $ne: true } })
      .select('path userId')
      .lean();

    if (!sampleFile) {
      console.log('⚠️  No files found in database');
      return;
    }

    console.log('📁 Sample file found:');
    console.log('   Path:', sampleFile.path);
    console.log('   User ID:', sampleFile.userId);
    console.log('');

    // Extract base folder from path (first part before any subfolder)
    const pathParts = sampleFile.path.split('/').filter(p => p);
    const baseFolder = pathParts[0] || sampleFile.path;

    console.log('🎯 Testing with base folder:', baseFolder);
    console.log('='.repeat(60));
    console.log('');

    // Test 1: Get counts for the base folder
    console.log('Test 1: Get folder counts for base folder');
    console.log('-'.repeat(60));
    const counts1 = await getFolderCounts(baseFolder, sampleFile.userId, 'user');
    console.log('Result:');
    console.log(JSON.stringify(counts1, null, 2));
    console.log('');

    // Test 2: Get all unique folder paths
    console.log('Test 2: Analyze folder structure');
    console.log('-'.repeat(60));
    const allFiles = await FileMeta.find({ isFolder: { $ne: true } })
      .select('path')
      .lean();

    const folderPaths = new Set();
    allFiles.forEach(file => {
      const parts = file.path.split('/');
      if (parts.length > 1) {
        // Get base folder
        folderPaths.add(parts[0]);
      }
    });

    console.log('Unique root folders found:', folderPaths.size);
    console.log('Root folders:', Array.from(folderPaths).slice(0, 10).join(', '));
    console.log('');

    // Test 3: Test with a specific folder path format (User's shoot-raw_xxxxx)
    const userShootFolders = Array.from(folderPaths).filter(f => 
      f.includes('shoot') || f.includes('User')
    );

    if (userShootFolders.length > 0) {
      console.log('Test 3: Get counts for User shoot folder');
      console.log('-'.repeat(60));
      console.log('Testing folder:', userShootFolders[0]);
      
      const counts3 = await getFolderCounts(
        userShootFolders[0], 
        sampleFile.userId, 
        'admin'
      );
      
      console.log('Result:');
      console.log(JSON.stringify(counts3, null, 2));
      console.log('');
    }

    // Test 4: Check for production folders
    console.log('Test 4: Check for production/post-production folders');
    console.log('-'.repeat(60));
    
    const preProductionCount = await FileMeta.countDocuments({
      path: /preproduction/i,
      isFolder: { $ne: true }
    });
    
    const postProductionCount = await FileMeta.countDocuments({
      path: /postproduction/i,
      isFolder: { $ne: true }
    });

    console.log('Files in pre-production folders:', preProductionCount);
    console.log('Files in post-production folders:', postProductionCount);
    console.log('');

    // Test 5: Sample folder structure analysis
    console.log('Test 5: Folder structure analysis');
    console.log('-'.repeat(60));
    
    const samplePaths = allFiles.slice(0, 10).map(f => f.path);
    console.log('Sample file paths:');
    samplePaths.forEach((path, idx) => {
      console.log(`  ${idx + 1}. ${path}`);
    });
    console.log('');

    console.log('='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('');

    // Disconnect
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Run tests
testFolderCounts();
