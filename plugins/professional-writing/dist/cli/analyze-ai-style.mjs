#!/usr/bin/env node
// harness-source-hash: sha256:2719561166b1e3b50e03b6c3f7d4a4135dfc04a6f3313191a85a8ffdde368289
import {
  analyzeAiStyle,
  formatAnalyzerReport
} from "../chunks/chunk-6HT76SUP.mjs";

// plugins/professional-writing/src/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
