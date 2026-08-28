#!/usr/bin/env node
// harness-source-hash: sha256:fb559c85df508375751cc04a15de4be44ab29f55bf278caeb94fa6241a928756
import {
  analyzeAiStyle,
  formatAnalyzerReport
} from "../chunks/chunk-SWNLLRYO.mjs";

// plugins/knowledge-work/modules/writing/src/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
