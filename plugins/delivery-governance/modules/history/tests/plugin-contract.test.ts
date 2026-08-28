import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { assertModuleRoutedOnBothHosts } from "../../../../../core/tests/support/aio-routes.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(dirname(dirname(ROOT))));

test("owner routes the private history guard and its migration skill stays bundled", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "history");
  assert.equal(existsSync(join(ROOT, "src", "entries", "hooks", "repository-history-migration.ts")), true);

  const skillNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(skillNames, ["repository-history-migration"]);
});

test("skill defines preflight, sealed execution, verification, and rollback boundaries", () => {
  const skill = readFileSync(
    join(ROOT, "skills", "repository-history-migration", "SKILL.md"),
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
      (entry) => entry.name === "delivery-governance",
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
