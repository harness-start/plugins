#!/usr/bin/env node
// harness-source-hash: sha256:260e491d8369ec89a3a058ab4b294ee5f3647ef8edb2e23c18fca630ff5fec27
import {
  runCli
} from "../chunks/chunk-33GKL4ST.mjs";
import "../chunks/chunk-7V3B2FH3.mjs";

// plugins/work-reporting/src/entries/cli/daily-work-report-save.ts
process.exitCode = await runCli("daily", "save");
