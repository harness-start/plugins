#!/usr/bin/env node
// harness-source-hash: sha256:d0961ce8030bd15ad4246c2605d597f6f8195a1d3a716dae7dc054bbe1353998

// plugins/professional-writing/src/entries/cli/analyze-ai-style.ts
import { readFileSync } from "node:fs";

// plugins/professional-writing/src/analyze-ai-style.ts
var RULES = [
  { id: "zh-meta-transition", language: "zh", category: "meta_transition", severity: "high", pattern: /(?:值得注意的是|需要指出的是|不可否认|毋庸置疑|众所周知|显而易见|总的来说|总体而言|综上所述|归根结底)/u, message: "Detected a meta transition that announces writing or a generic conclusion.", suggestion: "Delete the filler and start with the fact, action, or judgment." },
  { id: "zh-assistant-residue", language: "zh", category: "assistant_residue", severity: "high", pattern: /(?:作为(?:一个)?AI|希望(?:以上|这些).{0,12}(?:帮助|有用)|欢迎(?:随时)?告诉我|本文将)/u, message: "Detected assistant or template residue.", suggestion: "Remove helper-to-reader talk and keep the article body." },
  { id: "zh-marketing-abstraction", language: "zh", category: "marketing_language", severity: "medium", pattern: /(?:赋能|助力|全面提升|极大地提升|重塑.{0,12}格局|开启.{0,12}新篇章)/u, message: "Detected marketing or abstract slogans.", suggestion: "Replace with a concrete subject, action, and observable result." },
  { id: "en-ai-opener", language: "en", category: "meta_transition", severity: "high", pattern: /\b(?:in today's|ever-evolving|rapidly evolving|delve into|it is important to note|this article (?:explores|examines|will)|let's explore)\b/iu, message: "Detected a common AI-style opener or meta transition.", suggestion: "Delete the announcement and start with the concrete subject, action, or result." },
  { id: "en-assistant-residue", language: "en", category: "assistant_residue", severity: "high", pattern: /\b(?:i hope this helps|let me know|as an ai|knowledge cutoff)\b/iu, message: "Detected assistant or source-handling residue.", suggestion: "Remove conversational assistant text and keep only article prose." },
  { id: "en-canned-closer", language: "en", category: "canned_closer", severity: "high", pattern: /\b(?:in conclusion|to sum up|the future of)\b/iu, message: "Detected a canned conclusion transition.", suggestion: "End on the article's specific consequence or judgment instead of announcing the conclusion." },
  { id: "en-inflated-verb", language: "en", category: "inflated_verb", severity: "medium", pattern: /\b(?:serves as|stands as|represents a|is designed to)\b/iu, message: "Detected an inflated verb or copula-avoidance pattern.", suggestion: "Use is, has, includes, or the actual action when the inflated verb adds no meaning." }
];
function lineKind(line) {
  if (!line.trim()) return "blank";
  if (/^\s{0,3}#{1,6}\s+/u.test(line)) return "heading";
  if (/^\s{0,3}(?:[-+*]|\d+[.)])\s+/u.test(line)) return "list";
  if (/^\s*(`{3,}|~{3,})/u.test(line)) return "fence";
  return "prose";
}
function analyzeAiStyle(markdown2) {
  const findings = [];
  const lines = markdown2.split(/\n/u);
  let inFence = false;
  let serial = 1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const kind = lineKind(line);
    if (kind === "fence") {
      inFence = !inFence;
      continue;
    }
    if (inFence || kind === "blank") continue;
    for (const rule of RULES) {
      const match = line.match(rule.pattern);
      if (!match?.[0]) continue;
      findings.push({
        id: `${rule.id}-${serial}`,
        language: rule.language,
        category: rule.category,
        severity: rule.severity,
        message: rule.message,
        suggestion: rule.suggestion,
        line: index + 1,
        match: match[0]
      });
      serial += 1;
    }
  }
  return findings;
}
function formatAnalyzerReport(findings) {
  return `${JSON.stringify({ schema: "professional-writing/ai-style/v1", findings }, null, 2)}
`;
}

// plugins/professional-writing/src/entries/cli/analyze-ai-style.ts
var path = process.argv[2];
if (!path) {
  process.stderr.write("usage: analyze-ai-style.mjs <markdown-file>\n");
  process.exit(2);
}
var markdown = readFileSync(path, "utf8");
process.stdout.write(formatAnalyzerReport(analyzeAiStyle(markdown)));
