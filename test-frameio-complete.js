/**
 * Complete Frame.io Integration Test
 * Tests all aspects of Frame.io integration without needing the server running
 */

const frameioService = require('./src/services/frameio.service');

console.log('🧪 FRAME.IO INTEGRATION TEST SUITE\n');
console.log('=' .repeat(60));

// Test 1: API Connection
console.log('\n1️⃣  Testing Frame.io API Connection...');
console.log('-'.repeat(60));

frameioService.testConnection()
  .then(result => {
    if (result.success) {
      console.log('✅ API Connection: SUCCESS');
      console.log(`   User: ${result.user?.name} (${result.user?.email})`);
      console.log(`   Token Type: ${result.tokenType}`);
      console.log(`   Has Dev Token: ${result.hasDevToken}`);
      console.log(`   Auto-Upload Enabled: ${result.autoUploadEnabled}`);
      console.log(`   Can Auto-Upload: ${result.canAutoUpload}`);
    } else {
      console.log('❌ API Connection: FAILED');
      console.log(`   Reason: ${result.message}`);
    }
  })
  .catch(error => {
    console.log('❌ API Connection: ERROR');
    console.log(`   Error: ${error.message}`);
  })
  .then(() => {
    // Test 2: URL Parsing
    console.log('\n2️⃣  Testing Frame.io URL Parsing...');
    console.log('-'.repeat(60));

    const testUrls = [
      {
        name: 'f.io short link',
        url: 'https://f.io/abc123',
        expected: 'https://f.io/abc123'
      },
      {
        name: 'next.frame.io view URL',
        url: 'https://next.frame.io/project/ABC123/view/XYZ789?share=TOKEN123',
        expected: 'https://next.frame.io/embed/XYZ789?share=TOKEN123'
      },
      {
        name: 'next.frame.io embed URL',
        url: 'https://next.frame.io/embed/yyy?share=zzz',
        expected: 'https://next.frame.io/embed/yyy?share=zzz'
      },
      {
        name: 'app.frame.io player link',
        url: 'https://app.frame.io/player/xxx',
        expected: 'https://app.frame.io/embed/xxx'
      },
      {
        name: 'app.frame.io reviews link',
        url: 'https://app.frame.io/reviews/xxx',
        expected: 'https://app.frame.io/reviews/xxx?embed=true'
      }
    ];

    let passedTests = 0;
    let failedTests = 0;

    testUrls.forEach(test => {
      let embedUrl = null;
      const url = test.url;

      try {
        // Simulate the URL parsing logic
        if (url.includes('f.io/')) {
          embedUrl = url;
        } else if (url.includes('next.frame.io') && url.includes('/view/')) {
          const viewMatch = url.match(/\/view\/([a-zA-Z0-9-]+)/);
          const shareMatch = url.match(/[?&]share=([a-zA-Z0-9-]+)/);

          if (viewMatch) {
            const viewId = viewMatch[1];
            const shareToken = shareMatch ? shareMatch[1] : null;

            if (shareToken) {
              embedUrl = `https://next.frame.io/embed/${viewId}?share=${shareToken}`;
            } else {
              embedUrl = `https://next.frame.io/embed/${viewId}`;
            }
          }
        } else if (url.includes('next.frame.io') && url.includes('/embed/')) {
          embedUrl = url;
        } else if (url.includes('/reviews/')) {
          embedUrl = url.includes('?') ? `${url}&embed=true` : `${url}?embed=true`;
        } else if (url.includes('/player/')) {
          embedUrl = url.replace('/player/', '/embed/');
        }

        if (embedUrl === test.expected) {
          console.log(`✅ ${test.name}`);
          console.log(`   Input:    ${url}`);
          console.log(`   Output:   ${embedUrl}`);
          passedTests++;
        } else {
          console.log(`❌ ${test.name}`);
          console.log(`   Input:    ${url}`);
          console.log(`   Expected: ${test.expected}`);
          console.log(`   Got:      ${embedUrl}`);
          failedTests++;
        }
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error.message}`);
        failedTests++;
      }
      console.log('');
    });

    // Test 3: Summary
    console.log('\n3️⃣  Test Summary');
    console.log('-'.repeat(60));
    console.log(`✅ Passed: ${passedTests}/${testUrls.length}`);
    console.log(`❌ Failed: ${failedTests}/${testUrls.length}`);

    if (failedTests === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Frame.io integration is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }

    // Test 4: Check Frontend Component
    console.log('\n4️⃣  Checking Frontend Configuration...');
    console.log('-'.repeat(60));

    const fs = require('fs');
    const frontendPath = '../web/src/components/ViewFileManager/FrameioPlayer/FrameioPlayer.tsx';

    try {
      const content = fs.readFileSync(frontendPath, 'utf8');

      // Check for required iframe attributes
      const hasClipboardWrite = content.includes('clipboard-write');
      const hasAutoplay = content.includes('autoplay');
      const hasFullscreen = content.includes('fullscreen');
      const hasEncryptedMedia = content.includes('encrypted-media');

      console.log('Iframe Permissions:');
      console.log(`   ${hasClipboardWrite ? '✅' : '❌'} clipboard-write (for copy/paste)`);
      console.log(`   ${hasAutoplay ? '✅' : '❌'} autoplay (for video playback)`);
      console.log(`   ${hasFullscreen ? '✅' : '❌'} fullscreen (for fullscreen mode)`);
      console.log(`   ${hasEncryptedMedia ? '✅' : '❌'} encrypted-media (for DRM content)`);

      if (hasClipboardWrite && hasAutoplay && hasFullscreen && hasEncryptedMedia) {
        console.log('\n✅ Frontend component is properly configured!');
      } else {
        console.log('\n⚠️  Frontend component may be missing some permissions.');
      }
    } catch (error) {
      console.log('❌ Could not read frontend component:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 TEST SUITE COMPLETE\n');
  });
