import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueWriterCapability } from "../../../src/domains/training/lib/capability.js";
import { computeTrainingSubjectDigest, loadTrainingProject } from "../../../src/domains/training/lib/contract.js";
import { validPackage, validPlan } from "./fixture.js";

const PLUGIN_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const HARNESS = join(PLUGIN_ROOT, "dist", "cli", "harness.mjs");
const action = (name: string) => name.replace(/^project-/u, "");
const env = { ...process.env, AI_EXPERTS_SESSION_ID: "cli-test", AI_EXPERTS_TRIGGER_FROM: "test:cli" };

function run(name: string, args: string[], cwd: string) {
  return spawnSync(process.execPath, [HARNESS, "training", action(name), ...args], { cwd, env, encoding: "utf8" });
}

async function grant(name: "render" | "review" | "release", root: string, args: string[]) {
  const model = await loadTrainingProject(root);
  await issueWriterCapability({
    root,
    capability: `training-${name}`,
    argv: [HARNESS, "training", name, ...args],
    subjectDigest: computeTrainingSubjectDigest(model),
    sessionId: "cli-test",
    triggerFrom: "test:cli",
  });
}

test("registered CLI pipeline produces a release-valid training package", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "training-cli-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    const root = join(realpathSync(workspace), "artifacts", "training", "workflow-foundations");
    const initialized = run("project-init", [root, "--target", "release"], workspace);
    assert.equal(initialized.status, 0, initialized.stderr);
    writeFileSync(join(root, "plan.contract.json"), `${JSON.stringify(validPlan("workflow-foundations", "release"), null, 2)}\n`);
    writeFileSync(join(root, "training-package.json"), `${JSON.stringify(validPackage(), null, 2)}\n`);

    assert.equal(run("project-lint", [root, "--stage", "design"], workspace).status, 0);
    await grant("render", root, [root]);
    assert.equal(run("project-render", [root], workspace).status, 0);

    const reviewInput = join(workspace, "review-input.json");
    writeFileSync(reviewInput, `${JSON.stringify({
      schema: "training-program-design/review-input/v1",
      reviewer: { kind: "agent", id: "cli-test-reviewer" },
      criteria: ["alignment", "audience-variability", "practice", "assessment", "facilitation", "material-consistency", "transfer"].map((id) => ({ id, pass: true, evidence: `verified ${id} against current source and generated materials` })),
      findings: [],
    }, null, 2)}\n`);
    await grant("review", root, [root, reviewInput]);
    assert.equal(run("project-review", [root, reviewInput], workspace).status, 0);
    await grant("release", root, [root]);
    assert.equal(run("project-release", [root], workspace).status, 0);
    assert.equal(run("project-lint", [root, "--stage", "release"], workspace).status, 0);
    assert.equal(JSON.parse(readFileSync(join(root, "receipt.release.json"), "utf8")).stage, "release");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("review writer rejects review input stored inside the governed project", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "training-review-boundary-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    const root = join(realpathSync(workspace), "artifacts", "training", "course");
    const initialized = run("project-init", [root, "--target", "materials"], workspace);
    assert.equal(initialized.status, 0, initialized.stderr);
    writeFileSync(join(root, "plan.contract.json"), `${JSON.stringify(validPlan("course", "materials"), null, 2)}\n`);
    writeFileSync(join(root, "training-package.json"), `${JSON.stringify(validPackage(), null, 2)}\n`);
    await grant("render", root, [root]);
    assert.equal(run("project-render", [root], workspace).status, 0);
    const inside = join(root, "review-input.json");
    writeFileSync(inside, "{}\n");
    await grant("review", root, [root, inside]);
    const result = run("project-review", [root, inside], workspace);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /REVIEW_INPUT_OUTSIDE_PROJECT_REQUIRED/u);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
