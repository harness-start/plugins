#!/usr/bin/env node
import {
  runCli
} from "../chunks/chunk-6PLHALMA.mjs";

// plugins/work-report-insights/src/entries/cli/weekly-work-report-prepare.ts
process.exitCode = await runCli("weekly", "prepare");
