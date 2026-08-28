#!/usr/bin/env node
// harness-source-hash: sha256:4a3a4cd5dd6eee148d7e4947bd2f6617d6b3ebe34099aaf7254f848398c2d612
import {
  analyzeAiStyle,
  formatAnalyzerReport
} from "../chunks/chunk-WEQSQOCL.mjs";

// plugins/knowledge-work/modules/writing/src/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
