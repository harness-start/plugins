#!/usr/bin/env node
// harness-source-hash: sha256:03f90ffe2052d6a0f4f9dfb72ccccdc9c6192a89d5d0066fb001c89738cab3a9
import {
  runCli
} from "../chunks/chunk-MBJZLP5C.mjs";
import "../chunks/chunk-5RLQTG6W.mjs";

// plugins/knowledge-work/modules/reporting/src/entries/cli/weekly-work-report-transcript-scan.ts
process.exitCode = await runCli("weekly", "scan");
