#!/usr/bin/env node

/**
 * Debug Models Script
 * Tests if Booking and Order models are properly set up
 */

const mongoose = require("mongoose");
require("dotenv").config();

// Set default NODE_ENV if not provided
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
  console.log('⚠️  NODE_ENV not set, defaulting to "development"');
}

async function debugModels() {
  console.log("🔧 Debugging models and database setup...\n");

  try {
    // Connect to MongoDB
    console.log("📡 Connecting to MongoDB...");
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found. Please set MONGODB_URI or MONGODB_URL in your .env file');
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Test model imports
    console.log("\n📋 Testing model imports...");

    try {
      const models = require("./src/models");
      console.log("✅ Models index imported successfully");

      const { Booking, Order, User } = models;

      console.log(
        `- Booking model: ${Booking ? "✅ Available" : "❌ Missing"}`
      );
      console.log(`- Order model: ${Order ? "✅ Available" : "❌ Missing"}`);
      console.log(`- User model: ${User ? "✅ Available" : "❌ Missing"}`);

      if (!Booking) {
        console.log(
          "❌ Booking model is not available - this is the main issue!"
        );
        return;
      }

      // Test direct model access
      console.log("\n🧪 Testing direct Booking model creation...");

      const testBooking = {
        guestName: "Debug Test User",
        guestEmail: `debug-test-${Date.now()}@example.com`,
        guestPhone: "+1234567890",
        serviceType: "shoot-edit", // Test frontend enum value
        contentType: ["videography"], // Test frontend enum value
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endDateTime: new Date(
          Date.now() + 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000
        ),
        durationHours: 4,
        location: "Debug Test Location",
        budget: 1000,
      };

      const booking = await Booking.create(testBooking);
      console.log("✅ Booking created successfully:", booking._id);

      // Test booking retrieval
      const foundBooking = await Booking.findById(booking._id);
      console.log(
        "✅ Booking retrieved successfully:",
        foundBooking ? foundBooking._id : "NOT FOUND"
      );

      // Test booking update
      foundBooking.status = "paid";
      foundBooking.paymentStatus = "paid";
      await foundBooking.save();
      console.log("✅ Booking updated successfully");

      // Test order creation from booking
      if (Order) {
        console.log("\n📦 Testing Order creation from Booking...");

        const orderData = {
          client_id: null, // Guest booking
          guest_info: {
            name: foundBooking.guestName,
            email: foundBooking.guestEmail,
            phone: foundBooking.guestPhone,
          },
          booking_ref: foundBooking._id,
          service_type: foundBooking.serviceType,
          content_type: foundBooking.contentType,

          // Required fields from Order model
          shoot_datetimes: [
            {
              start_date_time: foundBooking.startDateTime,
              end_date_time: foundBooking.endDateTime,
              duration: foundBooking.durationHours,
              date_status: "confirmed",
            },
          ],

          location: foundBooking.location,
          geo_location: {
            type: "Point",
            coordinates: [0, 0], // Default coordinates
          },

          order_status: "pending",
          shoot_cost: foundBooking.budget,
          booking_source: "booking_conversion",
          cp_ids: [], // Empty array for new orders
        };

        const order = await Order.create(orderData);
        console.log("✅ Order created successfully:", order._id);

        // Update booking with order reference
        foundBooking.orderId = order._id;
        foundBooking.status = "converted";
        await foundBooking.save();
        console.log("✅ Booking updated with order reference");
      }

      // Test service imports
      console.log("\n⚙️  Testing service imports...");
      try {
        const services = require("./src/services");
        const { bookingService } = services;

        if (bookingService) {
          console.log("✅ Booking service available");
          console.log("Available methods:", Object.keys(bookingService));
        } else {
          console.log("❌ Booking service not available");
        }
      } catch (err) {
        console.log("❌ Error importing services:", err.message);
      }

      // Test controller
      console.log("\n🎮 Testing controller imports...");
      try {
        const bookingController = require("./src/controllers/booking.controller");
        console.log("✅ Booking controller available");
        console.log("Available methods:", Object.keys(bookingController));
      } catch (err) {
        console.log("❌ Error importing booking controller:", err.message);
      }

      // Clean up test data
      await Booking.findByIdAndDelete(booking._id);
      if (Order && foundBooking.orderId) {
        await Order.findByIdAndDelete(foundBooking.orderId);
      }
      console.log("\n🧹 Test data cleaned up");

      console.log("\n🎉 All model tests passed!");
    } catch (err) {
      console.error("❌ Model import error:", err);
    }
  } catch (err) {
    console.error("❌ Database connection error:", err);
  } finally {
    await mongoose.connection.close();
    console.log("\n📡 Database connection closed");
  }
}

if (require.main === module) {
  debugModels().catch(console.error);
}

module.exports = { debugModels };
