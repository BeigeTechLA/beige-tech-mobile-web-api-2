const WORKFLOW_STATUSES = [
  "not_started", "in_progress", "submitted", "revision_requested",
  "resubmitted", "approved", "completed",
];

const ALLOWED_TRANSITIONS = {
  not_started: ["in_progress"],
  in_progress: ["submitted"],
  submitted: ["revision_requested", "approved"],
  revision_requested: ["resubmitted"],
  resubmitted: ["revision_requested", "approved"],
  approved: ["completed"],
  completed: [],
};

module.exports = { WORKFLOW_STATUSES, ALLOWED_TRANSITIONS };
