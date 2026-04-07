/**
 * Test Frame.io URL parsing and embed URL generation
 */

console.log('🧪 Testing Frame.io URL Parsing\n');

// Test URLs - including realistic Frame.io URLs
const testUrls = [
  'https://f.io/abc123',
  'https://next.frame.io/project/ABC123/view/XYZ789?share=TOKEN123',
  'https://next.frame.io/project/abc-def-123/view/xyz-456-abc?share=share-token-789',
  'https://next.frame.io/embed/yyy?share=zzz',
  'https://app.frame.io/player/xxx',
  'https://app.frame.io/reviews/xxx',
];

console.log('📋 Testing different Frame.io URL formats:\n');

testUrls.forEach((url, index) => {
  console.log(`${index + 1}. Testing: ${url}`);

  // Simulate the URL parsing logic from frameioService.linkAssetToFile
  let embedUrl = null;

  try {
    if (url.includes('f.io/')) {
      embedUrl = url;
      console.log('   ✅ f.io short link - using directly');
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
        console.log('   ✅ next.frame.io view URL converted to embed');
      }
    } else if (url.includes('next.frame.io') && url.includes('/embed/')) {
      embedUrl = url;
      console.log('   ✅ next.frame.io embed URL - using directly');
    } else if (url.includes('/reviews/')) {
      embedUrl = url.includes('?') ? `${url}&embed=true` : `${url}?embed=true`;
      console.log('   ✅ Reviews link with embed parameter');
    } else if (url.includes('/player/')) {
      embedUrl = url.replace('/player/', '/embed/');
      console.log('   ✅ Player link converted to embed');
    }

    if (embedUrl) {
      console.log(`   📺 Embed URL: ${embedUrl}\n`);
    } else {
      console.log('   ❌ Could not generate embed URL\n');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }
});

console.log('\n✅ URL parsing test complete');
