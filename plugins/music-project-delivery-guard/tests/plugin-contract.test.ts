import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EXTERNAL_SKILLS } from "../src/lib/contract.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const pluginRoot = join(repositoryRoot, "plugins", "music-project-delivery-guard");

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("publishes the renamed music guard with separate authoring and review skills", async () => {
  const claude = await json(join(pluginRoot, ".claude-plugin", "plugin.json"));
  const codex = await json(join(pluginRoot, ".codex-plugin", "plugin.json"));
  assert.equal(claude.name, "music-project-delivery-guard");
  assert.equal(codex.name, "music-project-delivery-guard");
  assert.equal(claude.version, "0.4.0");
  assert.equal(codex.version, "0.4.0");

  const authoring = await readFile(join(pluginRoot, "skills", "music-project-authoring", "SKILL.md"), "utf8");
  const review = await readFile(join(pluginRoot, "skills", "music-project-review", "SKILL.md"), "utf8");
  assert.match(authoring, /^name: music-project-authoring$/mu);
  assert.match(review, /^name: music-project-review$/mu);
  assert.doesNotMatch(authoring, /write review\.music\.json/iu);
  assert.doesNotMatch(review, /node .*project-release\.mjs/iu);
});

test("pins a bilingual external adviser pool and exposes controlled seams", async () => {
  const dependencies = await json(join(pluginRoot, "skill-deps.json"));
  const skills = dependencies.skills as Array<Record<string, unknown>>;
  assert.deepEqual(skills.map(({ name }) => name), [
    "music-composition",
    "miaoxiang-music",
    "musical-dna",
    "workflow-audio-production",
    "workflow-analysis-quality",
  ]);
  assert.ok(skills.some(({ ecosystem }) => ecosystem === "zh"));
  assert.ok(skills.some(({ ecosystem }) => ecosystem === "en"));
  const musicalDna = skills.find(({ name }) => name === "musical-dna");
  assert.deepEqual(musicalDna?.allowFiles, ["SKILL.md"]);
  assert.equal(musicalDna?.revision, "e02ec7e226a6e4f8419fd3b88a1d8e472d421b32");
  assert.equal(musicalDna?.subpath, "skills/creative/music/musical-dna");
  assert.match(String(musicalDna?.license), /declared in SKILL\.md/u);
  for (const skill of skills) {
    assert.match(String(skill.revision), /^[a-f0-9]{40}$/u);
    assert.ok(["adviser", "reference-only"].includes(String(skill.mode)));
  }
  assert.deepEqual(skills.map(({ name, revision, ecosystem, mode }) => ({ name, revision, ecosystem, mode })), EXTERNAL_SKILLS.map(({ name, revision, ecosystem, mode }) => ({ name, revision, ecosystem, mode })));

  for (const entry of ["project-advice", "project-reference", "project-review", "project-stage"]) {
    await readFile(join(pluginRoot, "src", "entries", "cli", `${entry}.ts`), "utf8");
  }
  await readFile(join(pluginRoot, "src", "lib", "capability.ts"), "utf8");
  await readFile(join(pluginRoot, "src", "lib", "shell-policy.ts"), "utf8");
});
