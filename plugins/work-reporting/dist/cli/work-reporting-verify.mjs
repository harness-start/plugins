#!/usr/bin/env node
// harness-source-hash: sha256:4c3a669713c8207554e4286a9130dbff6a292abe559819b5b741b4c1b4593681
import {
  runCli
} from "../chunks/chunk-BG4A6PM2.mjs";
import "../chunks/chunk-6CJ4YRVB.mjs";

// plugins/work-reporting/src/entries/cli/work-reporting-verify.ts
process.exitCode = await runCli("report", "verify");
