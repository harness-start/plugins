import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

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

test("publishes a standalone professional-writing plugin", () => {
  for (const host of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = json(host);
    assert.equal(manifest.name, "professional-writing");
    assert.equal(manifest.version, "1.2.0");
    assert.equal("dependencies" in manifest, false);
    assert.equal(manifest.skills, "./skills/");
  }
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

test("published plugin excludes maintainer benchmark corpora and target-answer markers", () => {
  const skillDirectories = directoriesUnder(resolve(root, "skills"));
  assert.equal(skillDirectories.some((path) => path.split(/[\\/]/u).includes("evals")), false);

  const publishedFiles = [
    ...filesUnder(resolve(root, "src")),
    ...filesUnder(resolve(root, "skills")),
    ...filesUnder(resolve(root, "hooks")),
    ...filesUnder(resolve(root, "acceptance")),
    resolve(root, "README.md"),
  ];
  const forbidden = /(?:^|[./])evals\/|automation\/eval|(?:issue|pull request|pr)\s*#\d+|benchmark-(?:blind|map|tiers)\.md|Blind Benchmark|Blind Map|\*\*(?:预期|Expected)\*\*\s*:/iu;
  for (const path of publishedFiles) {
    assert.doesNotMatch(readFileSync(path, "utf8"), forbidden, path);
  }
});

test("live acceptance targets the bundled writing skills and analyzer CLI", () => {
  const expectationByCase = new Map(
    ["04-english-natural-writing", "05-chinese-natural-writing", "06-markdown-analyzer"].map((id) => [
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
    "analyze-ai-style.mjs",
  ]) {
    assert.ok(normalizedExpectations.includes(required), required);
  }
  assert.doesNotMatch(expectations, /skills\/(?:humanizer|stop-slop|shuorenhua|remove-ai-style)\/SKILL\.md|analyze_ai_style\.py/u);
  assert.match(
    expectationByCase.get("06-markdown-analyzer") ?? "",
    /SkillTool returning\.\*skill \(\[\^ \]\+:\)\?\$\{skill\}/u,
  );
});
