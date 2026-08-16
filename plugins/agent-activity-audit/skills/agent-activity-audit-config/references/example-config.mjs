// Project-local command exec audit trail (status + duration only).
export default {
  enabled: true,
  auditRoot: ".agent-activity-audit",
  maxCommandChars: 2000,
  redactSecrets: true,
};
