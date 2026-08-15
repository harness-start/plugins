#!/usr/bin/env node
import {
  runCli
} from "../chunks/chunk-6PLHALMA.mjs";

// plugins/work-report-insights/src/entries/cli/daily-work-report-transcript-scan.ts
process.exitCode = await runCli("daily", "scan");
