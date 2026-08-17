#!/usr/bin/env node
// harness-source-hash: sha256:fe5ec748ad17194faa3a78be45a17a33a1bf553e9a40156cf31b6308b1cb38f8
import {
  runCli
} from "../chunks/chunk-4ZWUJXNY.mjs";
import "../chunks/chunk-ALDQ5R4Y.mjs";

// plugins/work-reporting/src/entries/cli/work-reporting-verify.ts
process.exitCode = await runCli("report", "verify");
