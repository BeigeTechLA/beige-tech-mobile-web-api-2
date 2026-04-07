const Airtable = require('airtable');
const config = require('./src/config/config');

async function discoverAirtableFields() {
  console.log('🔍 Discovering Airtable field structure...\n');

  try {
    const base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.baseId);
    
    // Get a few existing records to see the field structure
    const records = await base(config.airtable.tableName)
      .select({
        maxRecords: 3
      })
      .all();

    console.log(`📊 Found ${records.length} existing records in table "${config.airtable.tableName}"\n`);

    if (records.length > 0) {
      console.log('🏷️ Available field names:');
      const fieldNames = Object.keys(records[0].fields);
      fieldNames.forEach((field, index) => {
        console.log(`   ${index + 1}. "${field}"`);
      });
      
      console.log('\n📝 Sample record structure:');
      console.log(JSON.stringify(records[0].fields, null, 2));
    }
    
    // Also try to get the table schema to see all available fields, not just populated ones
    try {
      console.log('\n🔍 Attempting to get table schema...');
      const tableInfo = await base(config.airtable.tableName).select({ maxRecords: 1 }).firstPage();
      if (tableInfo.length > 0) {
        console.log('📋 All available field names from schema:');
        // Get all fields from the record, including empty ones
        const allFields = tableInfo[0]._rawJson.fields || {};
        Object.keys(allFields).forEach((field, index) => {
          console.log(`   ${index + 1}. "${field}" (value: ${allFields[field] || 'empty'})`);
        });
      }
    } catch (schemaError) {
      console.log('📋 Could not retrieve full schema, showing only populated fields');
    }
    
    if (records.length === 0) {
      console.log('📋 Table is empty. Let\'s try to create a minimal test record...\n');
      
      // Try to create a minimal record to discover required fields
      try {
        const testRecord = await base(config.airtable.tableName).create([
          {
            fields: {
              'Name': 'Test Record',
            },
          },
        ]);
        console.log('✅ Test record created successfully!');
        console.log('📋 Record ID:', testRecord[0].id);
      } catch (createError) {
        console.log('❌ Failed to create test record:', createError.message);
        console.log('📋 This can help us understand the required field structure.');
      }
    }

  } catch (error) {
    console.error('❌ Error discovering fields:', error.message);
    console.error('📋 Error details:', error);
  }
}

// Run the discovery
discoverAirtableFields()
  .then(() => {
    console.log('\n✨ Field discovery completed!');
  })
  .catch((error) => {
    console.error('💥 Discovery failed:', error);
    process.exit(1);
  });