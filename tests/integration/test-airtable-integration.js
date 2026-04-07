const { airtableService } = require('./src/services');

// Test data mimicking a Stripe checkout session
const mockStripeSession = {
  object: 'checkout.session',
  id: 'cs_test_123456789',
  payment_intent: 'pi_test_123456789',
  metadata: {
    userId: 'test-user-123',
    guestName: 'John Smith',
    guestEmail: 'john.smith@example.com',
    guestPhone: '+1-555-0123',
    bookingData: JSON.stringify({
      contentType: 'photography',
      shootType: 'Brand Campaign',
      editType: 'Basic Color Correction',
      durationHours: 4,
      startDateTime: '2025-02-01T10:00:00.000Z',
      location: 'Los Angeles, CA',
      guestName: 'John Smith',
      guestEmail: 'john.smith@example.com',
      guestPhone: '+1-555-0123',
    }),
    totalAmount: '840.00',
    basePrice: '1000.00',
    discount: '160.00',
  },
};

async function testAirtableIntegration() {
  console.log('🧪 Testing Airtable Integration...\n');

  try {
    // Test 1: Create booking from payment
    console.log('1️⃣ Creating booking record in Airtable...');
    const bookingRecord = await airtableService.createBookingFromPayment(mockStripeSession);
    
    console.log('✅ Booking created successfully!');
    console.log('📋 Record Details:');
    console.log(`   - Airtable ID: ${bookingRecord.airtableId}`);
    console.log(`   - Confirmation #: ${bookingRecord.confirmationNumber}`);
    console.log(`   - Guest Name: ${bookingRecord.fields['Guest Name']}`);
    console.log(`   - Content Type: ${bookingRecord.fields['Content Type']}`);
    console.log(`   - Payment Amount: $${bookingRecord.fields['Payment Amount']}`);
    console.log(`   - Status: ${bookingRecord.fields['Status']}\n`);

    // Test 2: Get booking by ID
    console.log('2️⃣ Retrieving booking record...');
    const retrievedRecord = await airtableService.getBookingRecord(bookingRecord.airtableId);
    console.log('✅ Record retrieved successfully!\n');

    // Test 3: Update booking status
    console.log('3️⃣ Updating booking status to "assigned"...');
    await airtableService.updateBookingStatus(
      bookingRecord.airtableId,
      'assigned',
      {
        'Assigned Photographer': 'Sarah Johnson',
        'Notes': 'Test assignment via integration test',
      }
    );
    console.log('✅ Status updated successfully!\n');

    // Test 4: Get bookings by status
    console.log('4️⃣ Getting all paid bookings...');
    const paidBookings = await airtableService.getBookingsByStatus('paid', 5);
    console.log(`✅ Retrieved ${paidBookings.length} paid bookings\n`);

    console.log('🎉 All tests passed! Airtable integration is working correctly.\n');
    
    return bookingRecord.airtableId;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

// Run the test
testAirtableIntegration()
  .then((airtableId) => {
    console.log(`✨ Integration test completed successfully!`);
    console.log(`📝 Created test record with ID: ${airtableId}`);
    console.log(`🔗 You can view it in your Airtable base: https://airtable.com/appPiGuC9kUB13zXe`);
  })
  .catch((error) => {
    console.error('💥 Integration test failed:', error);
    process.exit(1);
  });