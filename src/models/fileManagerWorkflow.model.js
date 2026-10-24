const mongoose = require("mongoose");
const { toJSON } = require("./plugins");
const { WORKFLOW_STATUSES } = require("../constants/fileManagerWorkflow");

const statusHistorySchema = new mongoose.Schema({
  from: { type: String, enum: WORKFLOW_STATUSES, default: null },
  to: { type: String, enum: WORKFLOW_STATUSES, required: true },
  by: { type: String, default: null },
  byName: { type: String, default: "Unknown" },
  at: { type: Date, default: Date.now },
  note: { type: String, default: "" },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  type: { type: String, enum: ["approval", "revision"], required: true },
  version: { type: Number, default: 0 },
  notes: { type: String, default: "" },
  fileCount: { type: Number, default: 0 },
  by: { type: String, default: null },
  byName: { type: String, default: "Unknown" },
  at: { type: Date, default: Date.now },
}, { _id: false });

const fileManagerWorkflowSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true, trim: true },
  status: { type: String, enum: WORKFLOW_STATUSES, default: "not_started", index: true },
  statusHistory: { type: [statusHistorySchema], default: [] },
  requirements: {
    editingRequirements: { type: String, default: "" },
    requiredFormat: { type: String, default: "" },
    deliverablesText: { type: String, default: "" },
    revisionRounds: { type: Number, default: null, min: 0 },
    brief: { type: String, default: "" },
    requiredCount: { type: Number, default: null, min: 0 },
  },
  dueDate: { type: Date, default: null, index: true },
  producerId: { type: String, default: null },
  producerName: { type: String, default: "" },
  editorId: { type: String, default: null, index: true },
  editorName: { type: String, default: "" },
  editorType: { type: String, enum: ["internal", "external"], default: null },
  clientReference: {
    link: { type: String, default: "" },
    message: { type: String, default: "" },
    receivedAt: { type: Date, default: null },
    receivedBy: { type: String, default: null },
  },
  currentRevisionVersion: { type: Number, default: 0 },
  revisionCycle: { type: Number, default: 0 },
  submissions: { type: [submissionSchema], default: [] },
  startedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

fileManagerWorkflowSchema.index({ status: 1 });
fileManagerWorkflowSchema.index({ dueDate: 1 });
fileManagerWorkflowSchema.index({ updatedAt: -1 });
fileManagerWorkflowSchema.index({ editorId: 1 });
fileManagerWorkflowSchema.plugin(toJSON);

module.exports = mongoose.model("FileManagerWorkflow", fileManagerWorkflowSchema);
