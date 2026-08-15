#!/usr/bin/env node
// harness-source-hash: sha256:5dd6e44bf9e31a59e88572c25eca20796881558ed08fb016a2769f0eb24fb7e7
import {
  runCli
} from "../chunks/chunk-BKUUU55L.mjs";

// plugins/work-report-insights/src/entries/cli/weekly-work-report-prepare.ts
process.exitCode = await runCli("weekly", "prepare");
