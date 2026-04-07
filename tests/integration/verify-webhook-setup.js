const config = require('../../src/config/config');

function verifyWebhookSetup() {
  console.log('🔍 Verifying Stripe Webhook Setup...\n');

  // Check if required environment variables are set
  console.log('📋 Environment Variables:');
  console.log(`✅ STRIPE_SECRET_KEY: ${config.stripe.secretKey ? 'Set' : '❌ Missing'}`);
  console.log(`✅ STRIPE_ENDPOINT_SECRET: ${config.stripe.endpointSecret ? 'Set' : '❌ Missing'}`);
  
  if (config.stripe.endpointSecret) {
    console.log(`   Secret starts with: ${config.stripe.endpointSecret.substring(0, 15)}...`);
    
    if (config.stripe.endpointSecret.startsWith('whsec_')) {
      console.log('✅ Webhook secret format looks correct');
    } else {
      console.log('❌ Webhook secret should start with "whsec_"');
    }
  }

  console.log('\n📋 Airtable Configuration:');
  console.log(`✅ AIRTABLE_API_KEY: ${config.airtable.apiKey ? 'Set' : '❌ Missing'}`);
  console.log(`✅ AIRTABLE_BASE_ID: ${config.airtable.baseId ? 'Set' : '❌ Missing'}`);
  console.log(`✅ AIRTABLE_TABLE_NAME: ${config.airtable.tableName || '❌ Missing'}`);

  console.log('\n🔗 Webhook Endpoint Configuration:');
  console.log('Your webhook endpoint URL should be:');
  console.log('   Production: https://yourdomain.com/v1/stripe/webhook');
  console.log('   Development: Use ngrok or Stripe CLI');

  console.log('\n💡 Setup Instructions:');
  console.log('1. In Stripe Dashboard → Webhooks → Add endpoint');
  console.log('2. URL: https://yourdomain.com/v1/stripe/webhook');
  console.log('3. Events to send:');
  console.log('   - checkout.session.completed');
  console.log('   - payment_intent.succeeded');
  console.log('   - payment_intent.payment_failed');
  console.log('4. Copy the webhook signing secret to STRIPE_ENDPOINT_SECRET');

  console.log('\n🧪 For Local Testing:');
  console.log('Option 1 - Stripe CLI:');
  console.log('   stripe login');
  console.log('   stripe listen --forward-to localhost:5001/v1/stripe/webhook');
  console.log('   Use the webhook secret from the CLI output');
  console.log('');
  console.log('Option 2 - ngrok:');
  console.log('   ngrok http 5001');
  console.log('   Use the ngrok URL in Stripe Dashboard webhook config');

  console.log('\n🔧 Testing the Integration:');
  console.log('1. Make a test payment through your checkout flow');
  console.log('2. Check server logs for webhook events');
  console.log('3. Check Airtable for new booking records');
  console.log('4. Check stripe dashboard for webhook delivery attempts');

  if (!config.stripe.secretKey || !config.stripe.endpointSecret || !config.airtable.apiKey) {
    console.log('\n❌ Missing required configuration!');
    process.exit(1);
  } else {
    console.log('\n✅ Configuration looks good!');
  }
}

verifyWebhookSetup();