import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(ROOT));

function json(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

test("plugin exposes one migration skill and no hooks", () => {
  const codex = json(".codex-plugin/plugin.json");
  const claude = json(".claude-plugin/plugin.json");

  assert.equal(codex.name, "cross-repo-history-migration");
  assert.equal(claude.name, codex.name);
  assert.equal(codex.version, "0.2.0");
  assert.equal(claude.version, codex.version);
  assert.equal(codex.skills, "./skills/");
  assert.equal(claude.skills, codex.skills);
  assert.equal(Object.hasOwn(codex, "hooks"), false);
  assert.equal(Object.hasOwn(claude, "hooks"), false);
  assert.equal(existsSync(join(ROOT, "hooks")), false);

  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(skillNames, ["cross-repo-history-migration"]);
});

test("skill defines preflight, sealed execution, verification, and rollback boundaries", () => {
  const skill = readFileSync(
    join(ROOT, "skills", "cross-repo-history-migration", "SKILL.md"),
    "utf8",
  );

  for (const boundary of [
    "Preflight",
    "Seal",
    "Execute",
    "Verify",
    "Finish",
  ]) {
    assert.match(skill, new RegExp(`\\*\\*${boundary}\\*\\*`, "u"), boundary);
  }
  assert.match(skill, /sourceHead/u);
  assert.match(skill, /planDigest/u);
  assert.match(skill, /source repository remains read-only/iu);
  assert.match(skill, /target path.*absent/iu);
  assert.match(skill, /atomic/iu);
  assert.match(skill, /AI_EXPERTS_SESSION_ID/u);
  assert.match(skill, /AI_EXPERTS_TRIGGER_FROM/u);
});

test("plugin publishes readable scripts and appears once in both marketplaces", () => {
  for (const file of [
    "src/lib/history-migration.ts",
    "dist/cli/git-history-migration-preflight.mjs",
    "dist/cli/git-history-migration-execute.mjs",
  ]) {
    assert.equal(existsSync(join(ROOT, file)), true, file);
  }

  for (const path of [
    join(REPO, ".agents", "plugins", "marketplace.json"),
    join(REPO, ".claude-plugin", "marketplace.json"),
  ]) {
    const marketplace = JSON.parse(readFileSync(path, "utf8"));
    const entries = marketplace.plugins.filter(
      (entry) => entry.name === "cross-repo-history-migration",
    );
    assert.equal(entries.length, 1, path);
  }
});

test("plugin ships dual-host acceptance for refusal, success, and stale seals", () => {
  for (const name of [
    "01-dirty-source-refused",
    "02-history-preserved",
    "03-stale-source-refused",
  ]) {
    const root = join(ROOT, "acceptance", "cases", name);
    for (const file of ["case.toml", "prompt.md", "expect.sh"]) {
      assert.equal(existsSync(join(root, file)), true, `${name}/${file}`);
    }
    assert.match(
      readFileSync(join(root, "case.toml"), "utf8"),
      /hosts\s*=\s*\["claude",\s*"codex"\]/u,
    );
  }
});
