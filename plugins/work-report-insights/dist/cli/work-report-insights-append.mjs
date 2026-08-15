#!/usr/bin/env node
// harness-source-hash: sha256:042186fef6086fdec344292c98f4c0990944353bd53ef08a794823d5039a251e
import {
  runCli
} from "../chunks/chunk-QJRQ6UZN.mjs";

// plugins/work-report-insights/src/entries/cli/work-report-insights-append.ts
process.exitCode = await runCli("report", "append");
