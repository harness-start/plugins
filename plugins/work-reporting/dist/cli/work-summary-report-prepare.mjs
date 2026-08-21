#!/usr/bin/env node
// harness-source-hash: sha256:e8b6df29ba8aaac9e3dc4c92ae57340e889028e3f3cac74c254628b9634cdecc
import {
  runCli
} from "../chunks/chunk-6WVI3BFM.mjs";
import "../chunks/chunk-FRHTZYCB.mjs";

// plugins/work-reporting/src/entries/cli/work-summary-report-prepare.ts
process.exitCode = await runCli("summary", "prepare");
