#!/usr/bin/env node
// harness-source-hash: sha256:0550a3f3c9c250976568c9b660310db038d51a4281c67c97d1cee2f9213335cf
import {
  runCli
} from "../chunks/chunk-C3XIZLUD.mjs";
import "../chunks/chunk-5F2ODJQD.mjs";

// plugins/work-reporting/src/entries/cli/weekly-work-report-prepare.ts
process.exitCode = await runCli("weekly", "prepare");
