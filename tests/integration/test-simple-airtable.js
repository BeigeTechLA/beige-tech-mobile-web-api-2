const Airtable = require('airtable');
const config = require('./src/config/config');

async function testSimpleAirtable() {
  console.log('🧪 Testing simple Airtable record creation...\n');

  try {
    const base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.baseId);
    
    // Test creating a record with minimal fields
    const testRecord = await base(config.airtable.tableName).create([
      {
        fields: {
          'Guest Name': 'Test User',
          'Guest Email': 'test@example.com',
          'Content Type': 'photography',
          'Status': 'paid',
        },
      },
    ]);

    console.log('✅ Test record created successfully!');
    console.log('📋 Record ID:', testRecord[0].id);
    console.log('📋 Fields:', testRecord[0].fields);
    
    // Now get the record to see all field names
    const retrievedRecord = await base(config.airtable.tableName).find(testRecord[0].id);
    console.log('\n🏷️ All field names from created record:');
    Object.keys(retrievedRecord.fields).forEach((field, index) => {
      console.log(`   ${index + 1}. "${field}"`);
    });

    return testRecord[0].id;

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.error === 'UNKNOWN_FIELD_NAME') {
      console.log('💡 The field names in the code don\'t match the Airtable base.');
      console.log('💡 Please check your Airtable base field names.');
    }
    throw error;
  }
}

// Run the test
testSimpleAirtable()
  .then((recordId) => {
    console.log(`\n✨ Simple test completed successfully! Record ID: ${recordId}`);
  })
  .catch((error) => {
    console.error('💥 Simple test failed:', error.message);
    process.exit(1);
  });