#!/usr/bin/env node
// harness-source-hash: sha256:79eb582ff70d8199af6be7045d1a61bcfac5a7992385c0dc88fd75a3d05b1601
import {
  analyzeAiStyle,
  formatAnalyzerReport
} from "./chunk-WBNLLPZG.mjs";

// plugins/knowledge-work/src/domains/writing/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
