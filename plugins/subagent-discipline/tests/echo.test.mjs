import assert from "node:assert/strict";
import { test } from "node:test";
import { detectBriefEcho } from "../scripts/lib/echo.mjs";
import { analyzeReturn } from "../scripts/lib/hygiene.mjs";

test("short brief never flags echo", () => {
  const r = detectBriefEcho("hello world again today", "short brief only");
  assert.equal(r.echo, false);
});

test("high line overlap flags echo", () => {
  const brief = [
    "Please review the authentication module carefully.",
    "Focus on token expiry and refresh rotation paths.",
    "Ignore unrelated UI work for this pass entirely.",
    "Return findings with concrete file references only.",
  ].join("\n");
  const message = [
    "Please review the authentication module carefully.",
    "Focus on token expiry and refresh rotation paths.",
    "Ignore unrelated UI work for this pass entirely.",
    "Return findings with concrete file references only.",
    "Also maybe something else.",
  ].join("\n");
  const r = detectBriefEcho(message, brief, 0.72);
  assert.equal(r.echo, true);
  assert.ok(r.echoRatio >= 0.72);
});

test("analyzeReturn sets brief-echo when parentBrief overlaps", () => {
  const brief = [
    "Please review the authentication module carefully.",
    "Focus on token expiry and refresh rotation paths.",
    "Ignore unrelated UI work for this pass entirely.",
  ].join("\n");
  const message = brief;
  const a = analyzeReturn({ message, parentBrief: brief });
  assert.ok(a.reasons.includes("brief-echo"));
});
