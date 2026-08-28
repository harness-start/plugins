import assert from "node:assert/strict";
import test from "node:test";

import { detectUiSource, isIgnoredPath, isUiPath } from "../src/lib/detect.ts";

test("hard offset shadows and gradient text are findings on CSS", () => {
  const findings = detectUiSource("src/app.css", [
    "body { box-shadow: 4px 4px 0 #111; }",
    "h1 { -webkit-background-clip: text; }",
  ].join("\n"));
  assert.deepEqual(findings.map((item) => item.code), ["HARD_OFFSET_SHADOW", "GRADIENT_TEXT"]);
  assert.equal(findings[0]?.line, 1);
});

test("eyebrow class names and decorative section numbers are findings on markup", () => {
  const findings = detectUiSource("src/Hero.tsx", [
    "<p className=\"eyebrow\">New</p>",
    "<h2>01 Overview</h2>",
  ].join("\n"));
  assert.ok(findings.some((item) => item.code === "EYEBROW_KICKER"));
  assert.ok(findings.some((item) => item.code === "SECTION_NUMBER_DECORATION"));
});

test("repeating grid backgrounds are findings", () => {
  const findings = detectUiSource("theme.css", "main { background: repeating-linear-gradient(#fff, #eee 8px); }");
  assert.equal(findings[0]?.code, "REPEATING_GRID_BACKGROUND");
});

test("transition-all and removed focus outlines are reported as mechanical facts", () => {
  const findings = detectUiSource("src/app.css", [
    "button { transition: all 250ms ease; }",
    "a:focus { outline: none; }",
  ].join("\n"));
  assert.deepEqual(findings.map((item) => item.code), ["TRANSITION_ALL", "FOCUS_OUTLINE_REMOVED"]);
});

test("Tailwind transition-all and outline-none utilities are reported", () => {
  const findings = detectUiSource(
    "src/Button.tsx",
    '<button className="transition-all outline-none focus-visible:ring-2">Save</button>',
  );
  assert.deepEqual(findings.map((item) => item.code), ["TRANSITION_ALL", "FOCUS_OUTLINE_REMOVED"]);
});

test("mechanical motion and focus rules ignore explanatory comments", () => {
  const findings = detectUiSource(
    "page.css",
    "/* Never use transition: all; do not ship outline: none; */\n.button { transition: color 150ms ease; }",
  );

  assert.equal(findings.some((finding) => finding.code === "TRANSITION_ALL"), false);
  assert.equal(findings.some((finding) => finding.code === "FOCUS_OUTLINE_REMOVED"), false);
});

test("non-UI files and ignored paths produce no findings", () => {
  assert.equal(isUiPath("src/lib/detect.ts"), false);
  assert.equal(isIgnoredPath("node_modules/foo/index.css"), true);
  assert.deepEqual(detectUiSource("README.md", "box-shadow: 4px 4px 0 #000"), []);
  assert.deepEqual(detectUiSource("dist/app.css", "box-shadow: 4px 4px 0 #000"), []);
});

test("clean UI source is silent", () => {
  assert.deepEqual(detectUiSource("src/Button.tsx", "export const Button = () => <button>Save</button>;"), []);
});
