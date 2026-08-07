export default {
  entryTokens: ["/first-principles", "$first-principles"],
  donePhrases: ["done"],
  abortToken: "# first-principles-abort",
  writeBlock: {
    mode: "block",
    ledgerAllow: [".first-principles/**", "docs/decisions/**"],
    allowSpecMd: true,
  },
  stopGate: {
    mode: "block",
    blockImplementWhileOpen: true,
    softReportWhileOpen: true,
  },
  ledger: {
    primaryRelativePath: ".first-principles/ledger.json",
    maxBytes: 256 * 1024,
  },
  sessionTtlHours: 24,
};
