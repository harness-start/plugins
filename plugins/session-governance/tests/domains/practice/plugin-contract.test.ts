import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { assertModuleRoutedOnBothHosts, readModuleRoutes } from "../../../../../core/tests/support/aio-routes.js";

const root = resolve(import.meta.dirname, "../../..");

test("keeps engineering-practice private, routed, and self-contained", () => {
  assertModuleRoutedOnBothHosts(import.meta.url, "practice");
  assert.equal(existsSync(resolve(root, "skill-deps.json")), false);
  const skillNames = readdirSync(resolve(root, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const skill of ["engineering-judgment", "engineering-practice", "engineering-review", "engineering-review-checkpoint", "engineering-verification"]) assert.equal(skillNames.includes(skill), true, skill);
  assert.equal(existsSync(resolve(root, "skills", "engineering-debugging", "SKILL.md")), false);
});

test("checkpoint coordinates one bounded evidence-backed reviewer without native agent infrastructure", () => {
  const checkpoint = readFileSync(resolve(root, "skills", "engineering-review-checkpoint", "SKILL.md"), "utf8");
  assert.match(checkpoint, /maintainer/iu);
  assert.match(checkpoint, /breaker/iu);
  assert.match(checkpoint, /operator/iu);
  assert.match(checkpoint, /at most one|no more than one/iu);
  assert.match(checkpoint, /read-only/iu);
  assert.match(checkpoint, /NO_FINDINGS/iu);
  assert.match(checkpoint, /P0.*P3/isu);
  assert.match(checkpoint, /file:line/iu);
  assert.match(checkpoint, /independent review (?:was not|could not be) (?:run|performed)/iu);
  assert.match(checkpoint, /wait exactly once.*10 seconds|one wait.*10,?000/isu);
  assert.match(checkpoint, /interrupt.*fallback|fallback.*interrupt/isu);
  assert.equal(existsSync(resolve(root, "agents")), false);
});

test("review method is read-only and emits verifiable findings", () => {
  const review = readFileSync(resolve(root, "skills", "engineering-review", "SKILL.md"), "utf8");
  assert.match(review, /read-only/iu);
  assert.match(review, /severity/iu);
  assert.match(review, /file:line/iu);
  assert.match(review, /single exact.*file:line.*never.*line range/isu);
  assert.match(review, /evidence/iu);
  assert.match(review, /verification|recovery/iu);
  assert.match(review, /no findings/iu);
});

test("verification method scales evidence to the claim without making delivery a full-suite trigger", () => {
  const verification = readFileSync(resolve(root, "skills", "engineering-verification", "SKILL.md"), "utf8");
  assert.match(verification, /focused verification/iu);
  assert.match(verification, /broader verification/iu);
  assert.match(verification, /stable (?:public )?(?:interface|API).*direct.*oracle/isu);
  assert.match(verification, /security.*persistence.*migration.*concurrency.*deployment/isu);
  assert.match(verification, /commit.*pull request.*do not.*automatically.*broaden/isu);
  assert.match(verification, /run.*selected command.*to completion/isu);
  assert.match(verification, /claim.*scope|scope.*claim/isu);
  assert.doesNotMatch(verification, /Partial proves nothing/iu);
  assert.doesNotMatch(verification, /Revert fix.*MUST FAIL/isu);
});

test("both hosts implement mode C with prompt routing and no Stop gate", () => {
  for (const host of ["claude", "codex"] as const) {
    const routes = readModuleRoutes(import.meta.url, host, "practice");
    assert.deepEqual(Object.keys(routes).sort(), ["SessionStart", "UserPromptSubmit"]);
    assert.equal(routes.UserPromptSubmit.length, 1);
    assert.equal(routes.UserPromptSubmit[0].handler, "practice:engineering-practice");
    assert.deepEqual(routes.UserPromptSubmit[0].args, ["user-prompt"]);
  }
  const entry = readFileSync(resolve(root, "src", "domains", "practice", "entries", "hooks", "engineering-practice.ts"), "utf8");
  assert.doesNotMatch(entry, /stopBlock|runStop|outcome-challenge/iu);
});

test("acceptance inventory covers proportional verification, review checkpoints, and a simple control", () => {
  const cases = readdirSync(resolve(root, "acceptance", "cases"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("practice-"))
    .map((entry) => entry.name.replace(/^practice-/u, ""))
    .sort();
  assert.deepEqual(cases, [
    "01-implementation-and-verify",
    "02-review-regression",
    "03-simple-control",
    "04-high-risk-checkpoint",
    "05-explicit-checkpoint",
    "06-focused-small-change",
  ]);
});
