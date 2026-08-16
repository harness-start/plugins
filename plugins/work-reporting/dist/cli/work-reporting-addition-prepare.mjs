#!/usr/bin/env node
// harness-source-hash: sha256:2887b4e29130b2775641e5a04c281a6c97ab17c4bef500df91650bef4d71f6f9
import {
  runCli
} from "../chunks/chunk-5GMZ5KXO.mjs";
import "../chunks/chunk-Y2BCQ4MJ.mjs";

// plugins/work-reporting/src/entries/cli/work-reporting-addition-prepare.ts
process.exitCode = await runCli("report", "addition-prepare");
