#!/usr/bin/env node
// harness-source-hash: sha256:e096cc68d4c4fa272f90a77cf3b4e2e96ed45371fc9cb399770df3f1e57d598d
import {
  runCli
} from "../chunks/chunk-ZJQ5RZVC.mjs";
import "../chunks/chunk-HKHW5YOE.mjs";

// plugins/work-reporting/src/entries/cli/daily-work-report-transcript-scan.ts
process.exitCode = await runCli("daily", "scan");
