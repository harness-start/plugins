#!/usr/bin/env node
import {
  runCli
} from "../chunks/chunk-6PLHALMA.mjs";

// plugins/work-report-insights/src/entries/cli/work-report-insights-append.ts
process.exitCode = await runCli("report", "append");
