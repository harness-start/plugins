export default {
  commands: {
    verificationPatterns: [/node scripts\/validate-report\.mjs/u],
    expectedFailurePatterns: [/REPORT_MISSING/u],
  },
};
