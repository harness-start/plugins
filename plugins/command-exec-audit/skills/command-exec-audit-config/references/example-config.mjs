// Project-local command exec audit trail (status + duration only).
export default {
  enabled: true,
  auditRoot: ".command-exec-audit",
  gitignoreEnsure: true,
  maxCommandChars: 2000,
  redactSecrets: true,
};
