#!/usr/bin/env node
// harness-source-hash: sha256:c314461651259ab0f68d8ea564b98584f1efb3f2204958a7b7b8d5be9fa191f5
import {
  analyzeAiStyle,
  formatAnalyzerReport
} from "../chunks/chunk-WBXFX47A.mjs";

// plugins/knowledge-work/modules/writing/src/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
