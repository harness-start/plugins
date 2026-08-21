#!/usr/bin/env node
// harness-source-hash: sha256:0ce247e2c19806b5a8a3430d2a39aceecaadaa69988e99e5fd19e39a9c4a123c
import {
  runCli
} from "../chunks/chunk-B6NAQUPE.mjs";
import "../chunks/chunk-POQL7F3K.mjs";

// plugins/work-reporting/src/entries/cli/daily-work-report-save.ts
process.exitCode = await runCli("daily", "save");
