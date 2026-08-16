import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computePptxSubjectDigest, inspectPng, inspectPptxPackage, loadPptxProject, validatePptxModel, validatePptxReceipt } from "../src/lib/contract.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOOK = join(ROOT, "dist", "hooks", "presentation-production.mjs");
const cli = (name: string) => join(ROOT, "dist", "cli", `project-${name}.mjs`);
const hasOffice = spawnSync("soffice", ["--version"], { stdio: "ignore" }).status === 0
  && spawnSync("pdftoppm", ["-v"], { stdio: "ignore" }).status === 0;

function run(entry: string, args: string[], cwd: string) {
  return execFileSync(process.execPath, [entry, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, AI_EXPERTS_SESSION_ID: "pipeline-driver", AI_EXPERTS_TRIGGER_FROM: "pipeline-test" },
    timeout: 240_000,
  });
}

function authorize(entry: string, args: string[], cwd: string, sessionId: string) {
  const command = ["node", entry, ...args].join(" ");
  const hook = spawnSync(process.execPath, [HOOK, "pre"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, AI_EXPERTS_SESSION_ID: sessionId, AI_EXPERTS_TRIGGER_FROM: "pipeline-test:pre" },
    input: JSON.stringify({ cwd, session_id: sessionId, tool_name: "exec_command", tool_input: { cmd: command } }),
    timeout: 30_000,
  });
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(hook.stdout, "");
}

test("real Office pipeline closes render, probe, independent review, and release", { skip: !hasOffice, timeout: 300_000 }, async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pptx-pipeline-"));
  const project = join(workspace, "artifacts", "pptx", "pipeline-deck");
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    run(cli("init"), [project], workspace);
    run(cli("lint"), [project], workspace);

    authorize(cli("render"), [project], workspace, "producer-session");
    run(cli("render"), [project], workspace);
    authorize(cli("probe"), [project], workspace, "probe-session");
    run(cli("probe"), [project], workspace);

    let model = await loadPptxProject(project);
    const pagePath = "dist/pages/001.png";
    const reviewInput = join(workspace, "review-input.json");
    writeFileSync(reviewInput, `${JSON.stringify({
      schema: "presentation-production/review-input/v1",
      artifactId: "pipeline-deck",
      subjectDigest: computePptxSubjectDigest(model),
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "pipeline-reviewer", sessionId: "review-session" },
      pages: [{ index: 1, sha256: model.digests?.[pagePath], verdict: "pass" }],
      findings: [],
      checks: { hierarchy: "pass", legibility: "pass", clipping: "pass", consistency: "pass", accessibility: "pass" },
    }, null, 2)}\n`);

    authorize(cli("review"), [project, reviewInput], workspace, "review-session");
    run(cli("review"), [project, reviewInput], workspace);
    authorize(cli("release"), [project], workspace, "release-session");
    run(cli("release"), [project], workspace);

    model = await loadPptxProject(project);
    assert.deepEqual(validatePptxModel(model, { stage: "release" }), []);
    assert.equal(validatePptxReceipt(model), true);
    assert.equal(inspectPptxPackage(readFileSync(join(project, "dist", "pipeline-deck.pptx"))).slideCount, 1);
    assert.ok(inspectPng(readFileSync(join(project, pagePath))).width > 0);
    const render = JSON.parse(String(model.files?.["evidence.render.json"]));
    const review = JSON.parse(String(model.files?.["review.pptx.json"]));
    const receipt = JSON.parse(String(model.files?.["receipt.release.json"]));
    assert.notEqual(render.sessionId, review.reviewer.sessionId);
    assert.notEqual(receipt.sessionId, review.reviewer.sessionId);
    assert.equal(dirname(reviewInput), workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
