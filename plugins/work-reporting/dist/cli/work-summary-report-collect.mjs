#!/usr/bin/env node
// harness-source-hash: sha256:2eab515879ce4ea37d278d0b8eb6f92dca2f8c68cf97e791e75bb6f4b8a3bb64
import {
  runCli
} from "../chunks/chunk-HROMVM3P.mjs";
import "../chunks/chunk-ZC3I74PT.mjs";

// plugins/work-reporting/src/entries/cli/work-summary-report-collect.ts
process.exitCode = await runCli("summary", "collect");
