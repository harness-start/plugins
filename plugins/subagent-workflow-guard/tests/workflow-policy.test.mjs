import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  parseApplicationMarker,
  targetWithinScope,
  validateApplication,
  validateResultCard,
} from "../scripts/lib/workflow-policy.mjs";

test("application validation rejects secret-bearing handoffs", () => {
  assert.throws(() => validateApplication({
    runId: "run-1",
    role: "implementer",
    objective: "Use api_key=very-secret-value in the integration",
    acceptance: ["works"],
  }, "run-1"), /secret/u);
});

test("application markers are exact and path-safe", () => {
  assert.deepEqual(
    parseApplicationMarker("Read the artifact.\nSUBAGENT_APPLICATION task-1 abcdef0123456789"),
    { applicationId: "task-1", nonce: "abcdef0123456789" },
  );
  assert.equal(parseApplicationMarker("SUBAGENT_APPLICATION ../task abcdef0123456789"), null);
});

test("write scope stays inside the workspace prefix", () => {
  assert.equal(targetWithinScope("/repo/src/module/file.mjs", "/repo", ["src/module/**"]), true);
  assert.equal(targetWithinScope("/repo/src/other.mjs", "/repo", ["src/module/**"]), false);
  assert.equal(targetWithinScope("/outside/file.mjs", "/repo", ["**"]), false);
});

test("write scope accepts only exact paths or directory trees", () => {
  assert.throws(() => validateApplication({
    runId: "run-1",
    role: "implementer",
    objective: "Edit JavaScript files",
    acceptance: ["works"],
    writeScope: ["src/*.js"],
  }, "run-1"), /writeScope/u);
  assert.equal(targetWithinScope("/repo/src/secrets/config.yml", "/repo", ["src/*.js"]), false);
  assert.equal(targetWithinScope("/repo/src/index.js", "/repo", ["src/index.js"]), true);
});

test("write scope rejects traversal through a symlink outside the workspace", () => {
  const base = mkdtempSync(join(tmpdir(), "swg-scope-"));
  const root = join(base, "workspace");
  const outside = join(base, "outside");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(outside);
  symlinkSync(outside, join(root, "src", "link"));
  assert.equal(targetWithinScope(join(root, "src", "link", "file.mjs"), root, ["src/**"]), false);
});

test("Result Card requires status and all handoff headings", () => {
  assert.deepEqual(validateResultCard("Status: DONE\n## Answer\nDone").missing, [
    "Evidence",
    "Files/commands inspected",
    "Verification",
    "Assumptions",
    "Gaps",
    "Parent action needed",
  ]);
});

test("Result Card rejects empty heading-only completion claims", () => {
  const card = [
    "Status: DONE",
    "## Answer",
    "## Evidence",
    "## Files/commands inspected",
    "## Verification",
    "## Assumptions",
    "## Gaps",
    "## Parent action needed",
  ].join("\n");
  const result = validateResultCard(card);
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("Answer content"));
  assert.ok(result.missing.includes("Evidence content"));
  assert.ok(result.missing.includes("Verification content"));
});
