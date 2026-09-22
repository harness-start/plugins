import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computePptxSubjectDigest, inspectPng, inspectPptxPackage, loadPptxProject, validatePptxModel, validatePptxReceipt } from "../../../src/domains/presentation/lib/contract.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const HOOK = join(ROOT, "dist", "hooks", "dispatcher.mjs");
const HARNESS = join(ROOT, "dist", "cli", "harness.mjs");
const hasOffice = spawnSync("soffice", ["--version"], { stdio: "ignore" }).status === 0
  && spawnSync("pdftoppm", ["-v"], { stdio: "ignore" }).status === 0;

function run(action: string, args: string[], cwd: string) {
  return execFileSync(process.execPath, [HARNESS, "presentation", action, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, AI_EXPERTS_SESSION_ID: "pipeline-driver", AI_EXPERTS_TRIGGER_FROM: "pipeline-test" },
    timeout: 240_000,
  });
}

function authorize(action: string, args: string[], cwd: string, sessionId: string) {
  const command = ["node", HARNESS, "presentation", action, ...args].join(" ");
  const hook = spawnSync(process.execPath, [HOOK, "codex", "PreToolUse"], {
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
    run("init", [project], workspace);
    run("lint", [project], workspace);

    authorize("render", [project], workspace, "producer-session");
    run("render", [project], workspace);
    authorize("probe", [project], workspace, "probe-session");
    run("probe", [project], workspace);

    let model = await loadPptxProject(project);
    const pagePath = "dist/pages/001.png";
    const reviewInput = join(workspace, "review-input.json");
    writeFileSync(reviewInput, `${JSON.stringify({
      schema: "presentation-production/review-input/v5",
      artifactId: "pipeline-deck",
      subjectDigest: computePptxSubjectDigest(model),
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "pipeline-reviewer", sessionId: "review-session" },
      pages: [{ index: 1, sha256: model.digests?.[pagePath], verdict: "pass", audits: {
        headlineVoice: { status: "pass", classification: "plain", evidence: "The title is a direct label." },
        typographyRhythm: { status: "pass", evidence: "The rendered title follows the declared display role." },
        contentEncoding: { status: "pass", evidence: "The opening hierarchy carries the primary message." },
        grouping: { status: "not-applicable", evidence: "No group is declared.", rationale: "The page contains one statement." },
        readingPath: { status: "not-applicable", evidence: "No diagram is declared.", rationale: "The page contains one statement." },
      } }],
      findings: [],
      checks: {
        audienceBoundary: { status: "pass", anchors: ["slide:opening"], evidence: "The cover addresses the audience without exposing the private brief." },
        headlineVoice: { status: "pass", anchors: ["slide:opening"], evidence: "The visible title is a plain single-line label." },
        typographyRhythm: { status: "pass", anchors: ["slide:opening"], evidence: "The rendered title matches its bound OOXML role." },
        contentEncoding: { status: "pass", anchors: ["slide:opening"], evidence: "The opening visual hierarchy carries the primary message." },
        layoutRhythm: { status: "pass", anchors: ["deck"], evidence: "The one-page deck has no repeated-layout run." },
        relationshipSemantics: { status: "not-applicable", anchors: ["deck"], evidence: "The storyboard and structure evidence contain no native relationship diagram.", rationale: "No relationship-bearing slide is present." },
        groupingSemantics: { status: "not-applicable", anchors: ["deck"], evidence: "The storyboard contains no declared group.", rationale: "No grouped peers are present." },
      },
      reviewerRetell: { observedBeforeContract: "This deck leads to one explicit decision.", intendedTarget: "This deck leads to one explicit decision.", alignment: "pass", limitation: "Independent reviewer proxy; not a human recall study." },
      communicationReview: Object.fromEntries(["coreFidelity", "signatureCue", "semanticCausality", "retellAlignment", "invariantContinuity"].map((key) => [key, { status: "pass", anchor: "slide:opening", evidence: `${key} is visible in the reviewed page.`, recovery: `Revise ${key} and repeat independent review.` }])),
    }, null, 2)}\n`);

    authorize("review", [project, reviewInput], workspace, "review-session");
    run("review", [project, reviewInput], workspace);
    authorize("release", [project], workspace, "release-session");
    run("release", [project], workspace);

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
