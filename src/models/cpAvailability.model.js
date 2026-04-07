const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

// Define the avilability schema
const cpAvailabilitySchema = new mongoose.Schema(
  {
    // Client ID associated with the avilability
    cp_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sent_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    avilableTimes: {
      start_date_time: {
        type: Date,
        required: true,
      },
      end_date_time: {
        type: Date,
        required: true,
      },
      date_status: {
        type: String,
        default: "confirmed",
        enum: ["confirmed", "rejected", "changeRequested", "pending"],
      },
    },

  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
cpAvailabilitySchema.plugin(toJSON);
cpAvailabilitySchema.plugin(paginate);
// avilabilitySchema.index({ geo_location: "2dsphere" });

// Define the avilability model using the schema
const Availability = mongoose.model("CpAvailability", cpAvailabilitySchema);

// Export the avilability model
module.exports = Availability;
