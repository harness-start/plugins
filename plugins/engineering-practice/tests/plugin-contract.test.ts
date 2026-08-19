import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("publishes a standalone engineering-practice plugin", () => {
  for (const host of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const manifest = json(host);
    assert.equal(manifest.name, "engineering-practice");
    assert.equal(manifest.version, "2.0.0");
    assert.equal("dependencies" in manifest, false);
    assert.equal(manifest.skills, "./skills/");
    assert.match(manifest.description, /implementation.*review.*verification/iu);
    assert.doesNotMatch(manifest.description, /debug/iu);
  }
  assert.equal(existsSync(resolve(root, "skill-deps.json")), false);
  assert.deepEqual(
    readdirSync(resolve(root, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    ["engineering-judgment", "engineering-practice", "engineering-review", "engineering-verification"],
  );
  assert.equal(existsSync(resolve(root, "skills", "engineering-debugging", "SKILL.md")), false);
});

test("review method is read-only and emits verifiable findings", () => {
  const review = readFileSync(resolve(root, "skills", "engineering-review", "SKILL.md"), "utf8");
  assert.match(review, /read-only/iu);
  assert.match(review, /severity/iu);
  assert.match(review, /file:line/iu);
  assert.match(review, /evidence/iu);
  assert.match(review, /verification|recovery/iu);
  assert.match(review, /no findings/iu);
});

test("acceptance inventory covers implementation, review, and a simple control", () => {
  const cases = readdirSync(resolve(root, "acceptance", "cases"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(cases, [
    "01-implementation-and-verify",
    "02-review-regression",
    "03-simple-control",
    "04-contract-boundary",
  ]);
});
