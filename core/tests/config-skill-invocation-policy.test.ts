import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname, "../..");

type SkillFrontmatter = {
  name?: unknown;
  "disable-model-invocation"?: unknown;
};

type OpenAiMetadata = {
  policy?: {
    allow_implicit_invocation?: unknown;
  };
};

function skillFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return skillFiles(path);
    return entry.name === "SKILL.md" ? [path] : [];
  });
}

function frontmatter(path: string): SkillFrontmatter {
  const text = readFileSync(path, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  assert.ok(match?.[1], `${path} must have YAML frontmatter`);
  return parse(match[1]) as SkillFrontmatter;
}

const configSkills = skillFiles(resolve(ROOT, "plugins"))
  .map((path) => ({ path, metadata: frontmatter(path) }))
  .filter(({ metadata }) => typeof metadata.name === "string" && metadata.name.endsWith("-config"));

test("all config skills are explicit-only on Claude Code", () => {
  assert.ok(configSkills.length > 0, "expected at least one *-config skill");
  for (const { metadata } of configSkills) {
    assert.equal(metadata["disable-model-invocation"], true, `${String(metadata.name)} must be explicit-only on Claude Code`);
  }
});

test("all config skills are explicit-only on Codex", () => {
  assert.ok(configSkills.length > 0, "expected at least one *-config skill");
  for (const { path, metadata } of configSkills) {
    const openAiPath = resolve(path, "../agents/openai.yaml");
    assert.equal(existsSync(openAiPath), true, `${String(metadata.name)} must declare Codex invocation policy`);
    const openAi = parse(readFileSync(openAiPath, "utf8")) as OpenAiMetadata;
    assert.equal(openAi.policy?.allow_implicit_invocation, false, `${String(metadata.name)} must be explicit-only on Codex`);
  }
});
