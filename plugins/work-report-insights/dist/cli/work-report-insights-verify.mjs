#!/usr/bin/env node
// harness-source-hash: sha256:02595068c90d146741494a1d7e3701df870fdf2e07ae36924de0998fb9f13936
import {
  runCli
} from "../chunks/chunk-42B7SUE3.mjs";

// plugins/work-report-insights/src/entries/cli/work-report-insights-verify.ts
process.exitCode = await runCli("report", "verify");
