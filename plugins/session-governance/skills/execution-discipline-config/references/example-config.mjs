// Example project configuration for execution-discipline.
// Copy only the overrides the project intends to own.

export default {
  checks: {
    editLoop: "block",
    failedCommandRetry: "block",
    successfulCommandRepeat: "report",
    remotePolling: "report",
  },
  editLoop: {
    reportAt: 8,
    blockAt: 25,
    windowMinutes: 30,
    exemptPaths: [/^docs\//, /^fixtures\/generated\//],
  },
  commandRepeat: {
    failureReportAt: 2,
    failureBlockAt: 3,
    successReportAt: 8,
    successBlockAt: 16,
    windowMinutes: 10,
    retryBypass: /(?:^|\s)#\s*retry-ok\b/i,
  },
  polling: {
    sleepBudgetSeconds: 900,
    queryBudgetCount: 30,
    windowMinutes: 30,
    cooldownMinutes: 5,
    maxSleepPerCommandSeconds: 3600,
    whileLoopAssumedIterations: 10,
    pollBypass: /(?:^|\s)#\s*poll-ok\b/i,
  },
};
