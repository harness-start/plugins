#!/usr/bin/env node
// harness-source-hash: sha256:94704f8db952a375e0a6e7819d3587dac9c74d76e988a0b79fc5afa01f5a2ff6
import {
  analyzeAiStyle,
  formatAnalyzerReport
} from "./chunk-3OL33ZYS.mjs";

// plugins/knowledge-work/src/domains/writing/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
