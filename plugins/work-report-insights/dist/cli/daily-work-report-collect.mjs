#!/usr/bin/env node
// harness-source-hash: sha256:fabd61f22320e6f936be9aacdac06071e458f80c365b67d265d0bbf037d61138
import {
  runCli
} from "../chunks/chunk-XYSV3YZG.mjs";

// plugins/work-report-insights/src/entries/cli/daily-work-report-collect.ts
process.exitCode = await runCli("daily", "collect");
