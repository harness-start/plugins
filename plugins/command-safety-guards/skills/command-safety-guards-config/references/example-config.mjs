// Example project config for command-safety-guards.
// Copy ideas into <repo>/.command-safety-guards.mjs — not loaded from this path.
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
      reason: "force push 会改写远端历史",
      recovery: "改用 --force-with-lease 或走受控发布流程",
    },

    // Audit-only for a noisy but intentional tool
    {
      id: "report-terraform-apply",
      match: /\bterraform\s+apply\b/iu,
      mode: "report",
      title: "Terraform Apply Notice",
      reason: "基础设施变更应确认 plan 与影响面",
      recovery: "先 terraform plan 并保存 plan 文件后再 apply",
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
