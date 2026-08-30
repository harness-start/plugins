#!/usr/bin/env node
// harness-source-hash: sha256:f88f276d611a00d60ae0ea3cc9395d3468e8800fcb80af7642cdf9aa9a4cabe0
import {
  analyzeAiStyle,
  formatAnalyzerReport
} from "./chunk-KY2BQHLX.mjs";

// plugins/knowledge-work/src/domains/writing/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
