const mongoose = require('mongoose');

// Diagnostic records are intentionally short-lived. This lets QA investigate a
// notification without retaining delivery metadata indefinitely.
const pushDeliveryLogSchema = new mongoose.Schema(
  {
    trace_id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, index: true },
    topic: String,
    type: String,
    title: String,
    reference_id: String,
    reference_type: String,
    status: { type: String, default: 'received', index: true },
    events: [{
      step: { type: String, required: true },
      status: { type: String, required: true },
      message: String,
      token_id: String,
      session_id: String,
      device_type: String,
      firebase_project: String,
      firebase_error_code: String,
      created_at: { type: Date, default: Date.now },
    }],
    expires_at: { type: Date, required: true },
  },
  { timestamps: true }
);

// MongoDB removes each trace automatically twelve hours after creation.
pushDeliveryLogSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
pushDeliveryLogSchema.index({ user_id: 1, createdAt: -1 });
pushDeliveryLogSchema.index({ reference_type: 1, reference_id: 1, createdAt: -1 });

module.exports = mongoose.model('PushDeliveryLog', pushDeliveryLogSchema);
