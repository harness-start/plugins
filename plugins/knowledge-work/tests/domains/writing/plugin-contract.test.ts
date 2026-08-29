import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { assertModuleRoutedOnBothHosts, readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";

const root = resolve(import.meta.dirname, "../../..");

function filesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const target = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

function directoriesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const target = resolve(path, entry.name);
    return [target, ...directoriesUnder(target)];
  });
}

test("keeps professional-writing private, routed, and self-contained", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "writing");
  assert.equal(existsSync(resolve(root, "skill-deps.json")), false);
  for (const skill of [
    "actionable-response",
    "visual-explanation",
    "writing-terse-output",
    "writing-english-prose",
    "writing-chinese-prose",
    "writing-markdown-ai-style",
    "ai-flavor-remover",
  ]) {
    assert.equal(existsSync(resolve(root, "skills", skill, "SKILL.md")), true, skill);
  }

  for (const upstream of ["show-me", "i-have-adhd"]) {
    assert.equal(existsSync(resolve(root, "licenses", upstream, "LICENSE")), true, upstream);
    assert.equal(existsSync(resolve(root, "licenses", upstream, "NOTICE.md")), true, upstream);
  }
});

test("publishes separate actionable and visual response contracts", () => {
  const actionable = readFileSync(resolve(root, "skills/actionable-response/SKILL.md"), "utf8");
  assert.match(actionable, /next action|next step/iu);
  assert.match(actionable, /numbered|ordered list/iu);
  assert.match(actionable, /do not diagnose|never diagnose|identity assumption/iu);
  assert.match(actionable, /safety|destructive/iu);
  assert.match(actionable, /time estimate.*evidence|invent.*time/iu);
  assert.match(actionable, /default.*user action|by default.*user.*act/isu);
  assert.match(actionable, /do not wait.*ADHD|without.*ADHD/isu);
  assert.doesNotMatch(actionable, /\p{Script=Han}/u);

  const visual = readFileSync(resolve(root, "skills/visual-explanation/SKILL.md"), "utf8");
  assert.match(visual, /smallest.*visual|minimal.*view/iu);
  assert.match(visual, /pseudocode/iu);
  assert.match(visual, /call tree|component tree|file tree/iu);
  assert.match(visual, /Mermaid/u);
  assert.match(visual, /simple.*do not.*visual|do not.*force.*visual/isu);
  assert.match(visual, /do not.*HTML.*by default|default.*do not.*HTML/isu);
  assert.doesNotMatch(visual, /\p{Script=Han}/u);
});

test("both hosts run the deterministic Markdown analyzer after observed writes", () => {
  for (const host of ["claude", "codex"] as const) {
    const routes = readModuleRoutes(import.meta.url, host, "writing");
    assert.deepEqual(Object.keys(routes).sort(), ["PostToolUse", "SessionStart", "UserPromptSubmit"]);
    assert.equal(routes.UserPromptSubmit[0].handler, "writing:professional-writing");
    assert.deepEqual(routes.UserPromptSubmit[0].args, ["prompt"]);
    assert.match(routes.PostToolUse[0].matcher ?? "", /Write/iu);
    assert.match(routes.PostToolUse[0].matcher ?? "", /apply_patch/iu);
    assert.match(routes.PostToolUse[0].matcher ?? "", /create_file/iu);
    assert.match(routes.PostToolUse[0].matcher ?? "", /search_replace/iu);
    assert.equal(routes.PostToolUse[0].handler, "writing:professional-writing");
    assert.deepEqual(routes.PostToolUse[0].args, ["post"]);
  }
});

test("published plugin excludes maintainer benchmark corpora and target-answer markers", () => {
  const skillDirectories = directoriesUnder(resolve(root, "skills"));
  assert.equal(skillDirectories.some((path) => path.split(/[\\/]/u).includes("evals")), false);

  const publishedFiles = [
    ...filesUnder(resolve(root, "src")),
    ...filesUnder(resolve(root, "skills")),
    ...filesUnder(resolve(root, "acceptance")),
    resolve(root, "README.md"),
  ];
  const forbidden = /(?:^|[./])evals\/|automation\/eval|(?:issue|pull request|pr)\s*#\d+|benchmark-(?:blind|map|tiers)\.md|Blind Benchmark|Blind Map|\*\*(?:预期|Expected)\*\*\s*:/iu;
  for (const path of publishedFiles) {
    assert.doesNotMatch(readFileSync(path, "utf8"), forbidden, path);
  }
});

test("live acceptance targets the bundled writing skills, analyzer CLI, and write-time Hook", () => {
  const expectationByCase = new Map(
    ["writing-04-english-natural-writing", "writing-05-chinese-natural-writing", "writing-06-markdown-analyzer"].map((id) => [
      id,
      readFileSync(resolve(root, "acceptance", "cases", id, "expect.sh"), "utf8"),
    ]),
  );
  const expectations = [...expectationByCase.values()].join("\n");
  const normalizedExpectations = expectations.replaceAll("\\", "");

  for (const required of [
    "writing-english-prose",
    "writing-chinese-prose",
    "writing-markdown-ai-style",
    "ai-flavor-remover",
    "harness.mjs writing analyze",
  ]) {
    assert.ok(normalizedExpectations.includes(required), required);
  }
  assert.doesNotMatch(expectations, /skills\/(?:humanizer|stop-slop|shuorenhua|remove-ai-style)\/SKILL\.md|analyze_ai_style\.py/u);
  assert.match(
    expectationByCase.get("writing-06-markdown-analyzer") ?? "",
    /SkillTool returning\.\*skill \(\[\^ \]\+:\)\?\$\{skill\}/u,
  );
  const hookExpectation = readFileSync(resolve(root, "acceptance/cases/writing-09-markdown-post-hook/expect.sh"), "utf8");
  assert.match(hookExpectation, /Markdown AI-style findings/iu);
  assert.match(hookExpectation, /require_tool_feedback_signal/iu);
});
