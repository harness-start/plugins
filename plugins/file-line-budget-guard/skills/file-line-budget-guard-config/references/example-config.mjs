// Example project config for file-line-budget-guard.
// Copy ideas into <repo>/.file-line-budget-guard.mjs — do not require this file at runtime.
// User rules are prepended to built-ins; first match wins.

export default {
  rules: [
    // Skip generated / vendor paths early
    { match: /(^|\/)(?:vendor|node_modules|dist|build|coverage)\//, mode: "skip" },

    // Legacy module: higher budget, still blocked when growing past budget
    { match: /^src\/legacy\//, budget: 900, mode: "block" },

    // One-off report-only recipe
    { match: /(^|\/)Dockerfile$/, budget: 400, mode: "report" },

    // Stricter Vue SFCs than built-in default
    { match: /\.vue$/, budget: 400, mode: "block" },
  ],
  settings: {
    nearBudgetWarnRatio: 0.8,
    warnCooldownMinutes: 30,
    oversizeSoftGrowthLimit: 20,
  },
};
