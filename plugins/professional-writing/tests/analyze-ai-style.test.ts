import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeAiStyle } from "../src/analyze-ai-style.ts";

test("flags Chinese meta transitions and assistant residue", () => {
  const findings = analyzeAiStyle("值得注意的是，本文将赋能团队。希望这些对你有帮助。\n");
  assert.ok(findings.some((item) => item.category === "meta_transition"));
  assert.ok(findings.some((item) => item.category === "assistant_residue"));
  assert.ok(findings.some((item) => item.category === "marketing_language"));
});

test("flags English AI openers and skips fenced code", () => {
  const findings = analyzeAiStyle([
    "In today's rapidly evolving landscape, this article explores caching.",
    "```",
    "I hope this helps inside code",
    "```",
    "In conclusion, let me know.",
  ].join("\n"));
  assert.ok(findings.some((item) => item.id.startsWith("en-ai-opener")));
  assert.ok(findings.some((item) => item.id.startsWith("en-canned-closer")));
  assert.equal(findings.some((item) => item.match.includes("inside code")), false);
});

test("returns no findings for concrete prose", () => {
  assert.deepEqual(analyzeAiStyle("The cache stores the compiled module graph.\n"), []);
});
