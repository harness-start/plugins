#!/usr/bin/env node
// harness-source-hash: sha256:5b90d89c646be1b9e7284f1ae23f34868119cca95eac1fc1607f03459c3e97a5
import {
  runCli
} from "../chunks/chunk-T5BR6ST7.mjs";
import "../chunks/chunk-DUTGSILQ.mjs";

// plugins/work-reporting/src/entries/cli/work-summary-report-save.ts
process.exitCode = await runCli("summary", "save");
