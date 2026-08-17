#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { analyzeAiStyle, formatAnalyzerReport } from "../../analyze-ai-style.ts";

const path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
const markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
