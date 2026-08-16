#!/usr/bin/env node
// harness-source-hash: sha256:7b095d592e2ee57e5f2e483a35376e48f95eacc7a60fdead83983c27d9993707
import {
  runCli
} from "../chunks/chunk-GNPSY2UQ.mjs";
import "../chunks/chunk-NILNUBWW.mjs";

// plugins/work-report-insights/src/entries/cli/daily-work-report-collect.ts
process.exitCode = await runCli("daily", "collect");
