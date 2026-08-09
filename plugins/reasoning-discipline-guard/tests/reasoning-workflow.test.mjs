import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  extractMachineBlock,
  validateManifest,
  validateStage,
} from "../scripts/lib/artifacts.mjs";

const ENTRY = fileURLToPath(
  new URL("../scripts/reasoning-discipline-guard.mjs", import.meta.url),
);

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "reasoning-discipline-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  mkdirSync(join(root, ".reasoning-discipline", "20260809-candy"), {
    recursive: true,
  });
  return root;
}

function workflowDir(root) {
  return join(root, ".reasoning-discipline", "20260809-candy");
}

function manifest(overrides = {}) {
  return {
    schema: "reasoning-workflow/v1",
    id: "RW-20260809-candy",
    status: "open",
    branch: "exact",
    question: "What is the guaranteed minimum draw?",
    successCriteria: ["derive the minimum and prove minimality"],
    run: { epoch: 1 },
    currentStage: "frame",
    completionReceipt: null,
    resume: { nextStage: "frame", nextAction: "model the strategy variables" },
    ...overrides,
  };
}

function stage(stageName, previousReceipt, payload, branch = "exact") {
  return {
    schema: "reasoning-stage/v1",
    workflowId: "RW-20260809-candy",
    branch,
    stage: stageName,
    previousReceipt,
    payload,
  };
}

function stages(branch = "exact") {
  const common = {
    frame: stage("frame", null, {
      givens: [{ id: "G1", statement: "Shapes are distinguishable by touch", source: "given" }],
      assumptions: [{ id: "A1", statement: "The participant may choose shapes", source: "inferred", falsifier: "draws are fully blind" }],
      ambiguities: [{ id: "U1", statement: "Whether shape choice is allowed", impact: "changes 21 to 29", resolution: "use the tactile-choice reading" }],
      strategyVariables: [{ id: "S1", statement: "number of circles and stars", alternatives: ["fixed split", "blind draw"] }],
    }, branch),
    challenge: stage("challenge", "RD-R2", {
      attacks: [{ id: "X1", targetRef: "D1", kind: branch === "causal" ? "alternate-hypothesis" : branch === "decision" ? "sensitivity" : "counterexample", test: "try the strongest losing construction", outcome: "refuted", evidence: "the construction reaches only 20" }],
      revisions: [],
    }, branch),
    crossCheck: stage("cross-check", "RD-R3", {
      checks: [{ id: "C1", method: branch === "causal" ? "counterfactual" : branch === "decision" ? "sensitivity-analysis" : "independent-derivation", independenceNote: "reformulate from capacity bounds", inputRefs: ["D1", "X1"], outcome: "supported", evidence: "both paths yield the same result" }],
    }, branch),
    conclusion: stage("conclusion", "RD-R4", {
      conclusion: "21",
      confidence: "high",
      basisRefs: ["D1", "X1", "C1"],
      conditions: ["shape selection is allowed"],
      residualUncertainties: [],
    }, branch),
  };

  if (branch === "exact") {
    common.challenge.payload.attacks.push({
      id: "X2",
      targetRef: "D1",
      kind: "quantifier-order",
      test: "hold the participant's split fixed before varying flavor assignments",
      outcome: "supported",
      evidence: "the derivation preserves exists split then forall assignments",
    });
    common.analysis = stage("analysis", "RD-R1", {
      model: {
        variables: ["c", "s"],
        constraints: ["c <= 24", "s <= 17"],
        quantifiers: [
          { order: 1, kind: "exists", variables: ["c", "s"], statement: "the participant chooses the shape split" },
          { order: 2, kind: "forall", variables: ["flavor assignment"], statement: "every consistent flavor assignment must succeed" },
        ],
      },
      derivations: [{ id: "D1", claim: "c=9 and s=12 is minimal", dependsOn: ["G1", "A1", "S1"] }],
      candidateAnswer: "21",
    });
  } else if (branch === "causal") {
    common.analysis = stage("analysis", "RD-R1", {
      observations: [{ id: "O1", statement: "requests collide only after normalization", source: "observed" }],
      hypotheses: [
        { id: "H1", claim: "cache key normalization collides", falsifier: "distinct normalized keys", status: "supported", evidenceRefs: ["O1"] },
        { id: "H2", claim: "database rows are missing", falsifier: "rows are present", status: "falsified", evidenceRefs: ["O1"] },
      ],
      discriminatingTests: [{ id: "T1", statement: "compare raw and normalized cache keys", outcome: "H1 supported" }],
      candidateCause: "cache key normalization collision",
      derivations: [{ id: "D1", claim: "normalization is causal", dependsOn: ["O1", "H1", "T1"] }],
    }, branch);
  } else {
    common.analysis = stage("analysis", "RD-R1", {
      objectives: [{ id: "O1", statement: "minimize recovery time" }],
      constraints: [{ id: "K1", statement: "no new managed service" }],
      options: [{ id: "P1", statement: "local queue" }, { id: "P2", statement: "remote queue" }],
      criteria: [{ id: "C0", statement: "recovery time", weight: 1 }],
      evaluations: [{ id: "E1", optionRef: "P1", criterionRef: "C0", assessment: "best" }],
      candidateDecision: "local queue",
      derivations: [{ id: "D1", claim: "choose local queue", dependsOn: ["O1", "K1", "P1", "C0", "E1"] }],
    }, branch);
  }
  return common;
}

function markdown(label, value) {
  return `# ${label}\n\n\`\`\`json ${value.schema}\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function writeArtifact(path, value) {
  writeFileSync(path, markdown(value.stage ?? "Workflow", value));
}

function runHook(mode, event, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [ENTRY, mode], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

function parseOutput(stdout) {
  const line = String(stdout).trim();
  return line ? JSON.parse(line.split("\n").at(-1)) : null;
}

test("extractMachineBlock requires exactly one canonical fenced JSON block", () => {
  const good = markdown("Workflow", manifest());
  assert.equal(extractMachineBlock(good, "reasoning-workflow/v1").ok, true);
  assert.equal(extractMachineBlock("# none", "reasoning-workflow/v1").ok, false);
  assert.equal(extractMachineBlock(`${good}\n${good}`, "reasoning-workflow/v1").ok, false);
});

test("validateManifest accepts the lifecycle contract and rejects invented values", () => {
  assert.equal(validateManifest(manifest()).valid, true);
  assert.equal(validateManifest(manifest({ status: "finished" })).valid, false);
  assert.equal(validateManifest(manifest({ branch: "general" })).valid, false);
  assert.equal(validateManifest({ ...manifest(), unknown: true }).valid, false);
});

test("validateStage accepts all three branch-specific analysis contracts", () => {
  for (const branch of ["exact", "causal", "decision"]) {
    const result = validateStage(stages(branch).analysis, manifest({ branch }));
    assert.equal(result.valid, true, `${branch}: ${result.findings.join("; ")}`);
  }
});

test("validateStage enforces branch-specific challenge and cross-check methods", () => {
  const exact = stages("exact");
  for (const attack of exact.challenge.payload.attacks) attack.kind = "sensitivity";
  assert.equal(validateStage(exact.challenge, manifest()).valid, false);

  const causal = stages("causal");
  causal.analysis.payload.hypotheses = causal.analysis.payload.hypotheses.slice(0, 1);
  assert.equal(validateStage(causal.analysis, manifest({ branch: "causal" })).valid, false);

  const decision = stages("decision");
  decision.crossCheck.payload.checks[0].method = "independent-derivation";
  assert.equal(validateStage(decision.crossCheck, manifest({ branch: "decision" })).valid, false);
});

test("exact analysis and challenge require an explicit quantifier-order audit", () => {
  const exact = stages("exact");
  delete exact.analysis.payload.model.quantifiers;
  assert.equal(validateStage(exact.analysis, manifest()).valid, false);

  const withoutAudit = stages("exact");
  withoutAudit.challenge.payload.attacks = withoutAudit.challenge.payload.attacks.filter(
    (attack) => attack.kind !== "quantifier-order",
  );
  assert.equal(validateStage(withoutAudit.challenge, manifest()).valid, false);
});

test("hook remains idle until workflow.md is written", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-idle-data-"));
  const result = await runHook("stop", {
    cwd: root,
    session_id: "idle-session",
    last_assistant_message: "The answer is 21.",
  }, { PLUGIN_DATA: data });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("hook binds manifest, signs sequential stages, and passes a closed workflow", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-happy-data-"));
  const dir = workflowDir(root);
  const session = "happy-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());

  const bound = await runHook("post", {
    cwd: root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: workflowPath },
  }, env);
  assert.match(bound.stdout, /Bound RW-20260809-candy/u);

  const files = [
    ["01-frame.md", stages().frame, "RD-R1"],
    ["02-analysis.md", stages().analysis, "RD-R2"],
    ["03-challenge.md", stages().challenge, "RD-R3"],
    ["04-cross-check.md", stages().crossCheck, "RD-R4"],
    ["05-conclusion.md", stages().conclusion, "RD-R5"],
  ];
  for (const [name, value, receipt] of files) {
    const path = join(dir, name);
    writeArtifact(path, value);
    const signed = await runHook("post", {
      cwd: root,
      session_id: session,
      tool_name: "Write",
      tool_input: { file_path: path },
    }, env);
    assert.match(signed.stdout, new RegExp(receipt, "u"), signed.stdout || signed.stderr);
  }

  writeArtifact(workflowPath, manifest({
    status: "closed",
    currentStage: "conclusion",
    completionReceipt: "RD-R5",
    resume: { nextStage: null, nextAction: null },
  }));
  const closed = await runHook("post", {
    cwd: root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: workflowPath },
  }, env);
  assert.match(closed.stdout, /closed with RD-R5/u);

  const stopped = await runHook("stop", {
    cwd: root,
    session_id: session,
    last_assistant_message: "The guaranteed minimum is 21.",
  }, env);
  assert.equal(stopped.stdout, "", stopped.stdout);

  writeFileSync(
    join(dir, "01-frame.md"),
    readFileSync(join(dir, "01-frame.md"), "utf8").replace(
      "Shapes are distinguishable by touch",
      "Shapes might be distinguishable by touch",
    ),
  );
  const tampered = await runHook("stop", {
    cwd: root,
    session_id: session,
    last_assistant_message: "The verified answer is still 21.",
  }, env);
  assert.equal(parseOutput(tampered.stdout)?.decision, "block");
  assert.match(parseOutput(tampered.stdout)?.reason ?? "", /changed after RD-R1/u);
});

test("a new epoch rebuilds prior receipts and resumes at the declared stage", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-resume-data-"));
  const dir = workflowDir(root);
  const session = "resume-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  const resumed = manifest({
    status: "open",
    currentStage: "cross-check",
    run: { epoch: 2 },
    resume: { nextStage: "cross-check", nextAction: "run an independent derivation" },
  });
  const artifacts = stages();
  writeArtifact(workflowPath, resumed);
  writeArtifact(join(dir, "01-frame.md"), artifacts.frame);
  writeArtifact(join(dir, "02-analysis.md"), artifacts.analysis);
  writeArtifact(join(dir, "03-challenge.md"), artifacts.challenge);

  const bound = await runHook("post", {
    cwd: root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: workflowPath },
  }, env);
  assert.match(bound.stdout, /Bound RW-20260809-candy/u);

  const crossCheckPath = join(dir, "04-cross-check.md");
  writeArtifact(crossCheckPath, artifacts.crossCheck);
  const accepted = await runHook("post", {
    cwd: root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: crossCheckPath },
  }, env);
  assert.match(accepted.stdout, /Accepted cross-check as RD-R4/u, accepted.stdout);
});

test("hook blocks a skipped stage and invalidates downstream receipts after rewrite", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-invalid-data-"));
  const dir = workflowDir(root);
  const session = "invalid-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);

  const conclusionPath = join(dir, "05-conclusion.md");
  writeArtifact(conclusionPath, stages().conclusion);
  const skipped = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: conclusionPath } }, env);
  assert.match(skipped.stdout, /expected frame/u);

  const stopped = await runHook("stop", { cwd: root, session_id: session, last_assistant_message: "Answer: 21" }, env);
  assert.equal(parseOutput(stopped.stdout)?.decision, "block");

  const stateDir = join(data, "reasoning-discipline-guard", "sessions");
  assert.equal(readdirSync(stateDir).length, 1);
  assert.match(readFileSync(join(stateDir, readdirSync(stateDir)[0]), "utf8"), /RW-20260809-candy/u);
});

test("paused workflow passes Stop without conclusion receipts", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-paused-data-"));
  const dir = workflowDir(root);
  const path = join(dir, "workflow.md");
  writeArtifact(path, manifest({
    status: "paused",
    currentStage: "frame",
    resume: { nextStage: "frame", nextAction: "ask whether shape selection is allowed" },
  }));
  const env = { PLUGIN_DATA: data };
  await runHook("post", { cwd: root, session_id: "paused", tool_name: "Write", tool_input: { file_path: path } }, env);
  const stopped = await runHook("stop", { cwd: root, session_id: "paused", last_assistant_message: "I need one clarification." }, env);
  assert.equal(stopped.stdout, "");

  const falseConclusion = await runHook("stop", { cwd: root, session_id: "paused", last_assistant_message: "The verified answer is 21." }, env);
  assert.equal(parseOutput(falseConclusion.stdout)?.decision, "block");
  assert.match(parseOutput(falseConclusion.stdout)?.reason ?? "", /cannot accompany a conclusion claim/u);
});

test("one apply_patch event cannot sign multiple stages", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-batch-data-"));
  const dir = workflowDir(root);
  const workflowPath = join(dir, "workflow.md");
  const framePath = join(dir, "01-frame.md");
  const analysisPath = join(dir, "02-analysis.md");
  writeArtifact(workflowPath, manifest());
  writeArtifact(framePath, stages().frame);
  writeArtifact(analysisPath, stages().analysis);
  const env = { PLUGIN_DATA: data };
  await runHook("post", { cwd: root, session_id: "batch", tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  const patch = [
    "*** Begin Patch",
    `*** Update File: ${framePath}`,
    "+frame",
    `*** Update File: ${analysisPath}`,
    "+analysis",
    "*** End Patch",
  ].join("\n");
  const result = await runHook("post", {
    cwd: root,
    session_id: "batch",
    tool_name: "apply_patch",
    tool_input: { patch },
  }, env);
  assert.match(result.stdout, /can sign only one reasoning stage/u);
});

test("failed workflow write does not activate the session", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-failure-data-"));
  const path = join(workflowDir(root), "workflow.md");
  const env = { PLUGIN_DATA: data };
  const failure = await runHook("failure", {
    cwd: root,
    session_id: "failure",
    tool_name: "Write",
    tool_input: { file_path: path },
    error: "write failed",
  }, env);
  assert.match(failure.stdout, /were not advanced/u);
  const stopped = await runHook("stop", {
    cwd: root,
    session_id: "failure",
    last_assistant_message: "The answer is 21.",
  }, env);
  assert.equal(stopped.stdout, "");
});
