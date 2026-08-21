import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EXTERNAL_SKILLS } from "../src/lib/contract.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const pluginRoot = join(repositoryRoot, "plugins", "music-production");
const execFileAsync = promisify(execFile);

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("publishes the renamed music guard with separate authoring and review skills", async () => {
  const claude = await json(join(pluginRoot, ".claude-plugin", "plugin.json"));
  const codex = await json(join(pluginRoot, ".codex-plugin", "plugin.json"));
  assert.equal(claude.name, "music-production");
  assert.equal(codex.name, "music-production");
  assert.equal(claude.version, "0.4.0");
  assert.equal(codex.version, "0.4.0");

  const authoring = await readFile(join(pluginRoot, "skills", "music-project-authoring", "SKILL.md"), "utf8");
  const review = await readFile(join(pluginRoot, "skills", "music-project-review", "SKILL.md"), "utf8");
  assert.match(authoring, /^name: music-project-authoring$/mu);
  assert.match(review, /^name: music-project-review$/mu);
  assert.doesNotMatch(authoring, /write review\.music\.json/iu);
  assert.doesNotMatch(review, /node .*project-release\.mjs/iu);
});

test("uses a bundled bilingual first-party adviser pool and exposes controlled seams", async () => {
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(join(pluginRoot, "skill-deps.json")), false);
  assert.deepEqual(EXTERNAL_SKILLS.map(({ name, ecosystem, mode }) => ({ name, ecosystem, mode })), [
    { name: "music-composition-method", ecosystem: "en", mode: "adviser" },
    { name: "music-genre-reference", ecosystem: "zh", mode: "reference-only" },
    { name: "music-reference-profile", ecosystem: "en", mode: "reference-only" },
    { name: "music-mix-qc", ecosystem: "en", mode: "reference-only" },
  ]);
  for (const name of EXTERNAL_SKILLS.map((entry) => entry.name)) {
    const skill = await readFile(join(pluginRoot, "skills", name, "SKILL.md"), "utf8");
    assert.match(skill, new RegExp(`^name:\\s*${name}$`, "mu"));
  }
  const notice = await readFile(join(pluginRoot, "licenses", "music-composition", "NOTICE.md"), "utf8");
  assert.match(notice, /CC-BY-4\.0/u);

  for (const entry of ["project-advice", "project-reference", "project-review", "project-stage"]) {
    await readFile(join(pluginRoot, "src", "entries", "cli", `${entry}.ts`), "utf8");
  }
  await readFile(join(pluginRoot, "src", "lib", "capability.ts"), "utf8");
  await readFile(join(pluginRoot, "src", "lib", "shell-policy.ts"), "utf8");
});

test("bundled composition-method integrity check passes in a clean consumer tree", async () => {
  const script = join(pluginRoot, "skills", "music-composition-method", "scripts", "music_theory_sanity_check.py");
  const { stdout } = await execFileAsync("python3", [script]);
  assert.match(stdout, /music_theory_sanity_check: PASS/u);
});
