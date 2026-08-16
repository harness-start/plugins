#!/usr/bin/env node
// harness-source-hash: sha256:db08f2a5683ef6c09648006a46a62d4b628c169ab8dec4f7dae5898f03a24b9b
import {
  runCli
} from "../chunks/chunk-O3PPSC5D.mjs";
import "../chunks/chunk-A55E4EAH.mjs";

// plugins/work-reporting/src/entries/cli/work-reporting-addition-prepare.ts
process.exitCode = await runCli("report", "addition-prepare");
