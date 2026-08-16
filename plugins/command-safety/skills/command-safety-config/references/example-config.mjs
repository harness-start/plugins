// Example project config for command-safety.
// Copy ideas into <repo>/.command-safety.mjs — not loaded from this path.
// User rules prepend built-ins; first match wins.
// Note: mode "allow" does not bypass engines.dangerousRm or denyEscalation.

export default {
  rules: [
    // Unblock a known staging maintenance command (narrow)
    {
      id: "allow-redis-flushdb-staging",
      match: /\bredis-cli\b[^\n]*\b-n\s+15\b[^\n]*\bFLUSHDB\b/iu,
      mode: "allow",
    },

    // Extra project policy
    {
      id: "no-git-force-push",
      match: /\bgit\s+push\b[^\n]*--force(?:\s|$)/iu,
      mode: "deny",
      title: "Git Force Push Guard",
      reason: "force push rewrites remote history",
      recovery: "use --force-with-lease or a controlled release process",
    },

    // Audit-only for a noisy but intentional tool
    {
      id: "report-terraform-apply",
      match: /\bterraform\s+apply\b/iu,
      mode: "report",
      title: "Terraform Apply Notice",
      reason: "infrastructure changes require a reviewed plan and impact scope",
      recovery: "run terraform plan and save the plan file before apply",
    },
  ],
  settings: {
    engines: {
      dangerousRm: true,
      mysqlReplicationPreflight: true,
      secretRead: true,
      fileSafety: true,
      denyEscalation: true,
    },
    escalation: {
      windowMinutes: 10,
      threshold: 3,
    },
  },
};
