const mongoose = require("mongoose");
const { toJSON, paginate, aggregationPaginate } = require("./plugins");

const meetingSchema = new mongoose.Schema(
  {
    meeting_date_time: {
      type: Date,
      required: true,
    },
    meeting_end_time: {
      type: Date,
      required: false,
    },
    meetLink: {
      type: String,
      required: false,
    },
    meeting_status: {
      type: String,
      enum: [
        "completed",
        "cancelled",
        "pending",
        "confirmed",
        "rescheduled",
        "change_request",
        "in_progress",
      ],
      default: "pending",
      required: true,
    },
    meeting_type: {
      type: String,
      enum: ["pre_production", "post_production"],
    },
    meeting_title: {
      type: String,
    },
    description: {
      type: String,
    },
    // Default participants
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    cp_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    // Track who created the meeting
    created_by_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    // Additional participants that can be added/removed by admin
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    change_request: {
      requested_by: {
        type: String,
        enum: ["client", "cp", "admin"],
      },
      request_type: {
        type: String,
        enum: [
          "cp_cancel_request",
          "client_cancel_request",
          "cp_reschedule_request",
          "client_reschedule_request",
        ],
      },
      request_status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      request_date_time: {
        type: Date,
      },
    },
    // Track participant responses to meeting invitations
    participant_responses: [
      {
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        response: {
          type: String,
          enum: ["accepted", "declined", "pending"],
          default: "pending",
        },
        responded_at: {
          type: Date,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

meetingSchema.plugin(paginate);
meetingSchema.plugin(aggregationPaginate);
meetingSchema.plugin(toJSON);

/**
 * @typedef Meeting
 */
const Meeting = mongoose.model("Meeting", meetingSchema);

module.exports = Meeting;
