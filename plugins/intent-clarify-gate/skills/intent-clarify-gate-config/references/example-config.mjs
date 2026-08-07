/** @type {import('../../../scripts/lib/config.mjs').DEFAULT_CONFIG} */
export default {
  entryTokens: ["/grill-me", "$grill-me", "/grilling", "$grilling"],
  donePhrases: ["完成"],
  enableEngineeringBypass: true,
  writeBlock: {
    mode: "block",
    ledgerAllow: [".grill-ledgers/**", "docs/decisions/**"],
    allowSpecMd: true,
  },
  stopGate: {
    blockImplementWhileOpen: true,
    remindCompleteOptionAfterRounds: 5,
  },
  skillInstall: {
    mode: "off",
    source: "https://github.com/mattpocock/skills",
    skills: ["grill-me"],
    requireGrillingPrimitive: false,
    timeoutMs: 120000,
  },
  sessionTtlHours: 24,
  constraintInject: true,
};
