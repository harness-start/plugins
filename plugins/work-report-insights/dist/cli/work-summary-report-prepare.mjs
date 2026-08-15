#!/usr/bin/env node
// harness-source-hash: sha256:732189012c5713973ec69794b790c4b7fa6094b07cc53261957e2fe6b257c901
import {
  runCli
} from "../chunks/chunk-7DW325BF.mjs";

// plugins/work-report-insights/src/entries/cli/work-summary-report-prepare.ts
process.exitCode = await runCli("summary", "prepare");
