import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
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
      outputContract: { mode: "free-form" },
    }, branch),
  };

  if (branch === "exact") {
    common.frame.payload.strategyVariables[0].kind = "allocation";
    common.frame.payload.strategyVariables[0].components = ["roundDraws", "starDraws"];
    common.frame.payload.controlAssignments = [{
      id: "R1",
      strategyRef: "S1",
      dimension: "shape split",
      controller: "participant",
      timing: "before flavors are revealed",
      basis: "shapes are distinguishable by touch",
      alternative: "the entire draw is uncontrolled",
      impact: "the answer changes from 21 to 29",
    }];
    common.frame.payload.observabilityAudit = [{
      id: "O1",
      dimension: "shape",
      sourceRef: "G1",
      observable: true,
      controlEffect: "allocation",
      timing: "during candy selection",
      strategyRef: "S1",
      overrideSourceRef: null,
      implication: "the participant can allocate draws between shapes",
    }];
    common.challenge.payload.attacks.push({
      id: "X2",
      targetRef: "D1",
      kind: "quantifier-order",
      test: "hold the participant's split fixed before varying flavor assignments",
      outcome: "supported",
      evidence: "the derivation preserves exists split then forall assignments",
    });
    common.challenge.payload.attacks.push({
      id: "X3",
      targetRef: "R1",
      kind: "control-assignment",
      test: "compare shape-selective and fully blind models",
      outcome: "supported",
      evidence: "touch distinguishes shape but not flavor, so only the shape split is participant-controlled",
      strategyRef: "S1",
      fixedAssignment: { roundDraws: 9, starDraws: 12 },
      variedEnvironment: ["flavorAssignment"],
    });
    common.crossCheck.payload.strategySearches = [{
      id: "Q1",
      strategyRef: "S1",
      method: "deterministic-tool",
      searchedComponents: ["roundDraws", "starDraws"],
      variedEnvironment: ["flavorAssignment"],
      bestAssignment: { roundDraws: 9, starDraws: 12 },
      objectiveValue: 21,
      answerBinding: "objective",
      replayModel: {
        kind: "finite-partition-allocation",
        domains: [
          { component: "roundDraws", min: 0, max: 24 },
          { component: "starDraws", min: 0, max: 17 },
        ],
        responseGroups: [
          {
            component: "roundDraws",
            members: [
              { variable: "roundApple", capacity: 7 },
              { variable: "roundPeach", capacity: 9 },
              { variable: "roundWatermelon", capacity: 8 },
            ],
          },
          {
            component: "starDraws",
            members: [
              { variable: "starApple", capacity: 7 },
              { variable: "starPeach", capacity: 6 },
              { variable: "starWatermelon", capacity: 4 },
            ],
          },
        ],
        successCondition: {
          op: "or",
          args: [
            {
              op: "and",
              args: [
                { op: "gte", variable: "roundApple", value: 1 },
                { op: "gte", variable: "starPeach", value: 1 },
              ],
            },
            {
              op: "and",
              args: [
                { op: "gte", variable: "roundPeach", value: 1 },
                { op: "gte", variable: "starApple", value: 1 },
              ],
            },
          ],
        },
        objective: { sense: "minimize", terms: ["roundDraws", "starDraws"] },
        sourceRefs: ["G1"],
      },
      result: "the searched allocation guarantees 21 and no smaller allocation does",
      evidence: "exhaustive search over allocations and every consistent flavor assignment",
    }];
    common.analysis = stage("analysis", "RD-R1", {
      model: {
        variables: ["roundDraws", "starDraws"],
        constraints: ["roundDraws <= 24", "starDraws <= 17"],
        quantifiers: [
          { order: 1, kind: "exists", variables: ["roundDraws", "starDraws"], strategyRefs: ["S1"], statement: "the participant chooses the shape split" },
          { order: 2, kind: "forall", variables: ["flavorAssignment"], strategyRefs: [], statement: "every consistent flavor assignment must succeed" },
        ],
      },
      strategyEvaluations: [{
        id: "E1",
        strategyRef: "S1",
        fixedAssignment: { roundDraws: 9, starDraws: 12 },
        variedEnvironment: ["flavorAssignment"],
        result: "the fixed split guarantees success",
        evidenceRefs: ["D1"],
      }],
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

async function postStage(env, { cwd, session, path }) {
  const name = String(path).split(/[/\\]/u).pop();
  if (name === "03-challenge.md") {
    await approveIndependentReview(env, { cwd, session, stage: "challenge", agentId: `${session}-challenge-reviewer` });
  } else if (name === "04-cross-check.md") {
    await approveIndependentReview(env, { cwd, session, stage: "cross-check", agentId: `${session}-cross-reviewer` });
  }
  return runHook("post", { cwd, session_id: session, tool_name: "Write", tool_input: { file_path: path } }, env);
}

async function approveIndependentReview(env, { cwd, session, stage, agentId }) {
  const reserved = await runHook("pre", {
    cwd,
    session_id: session,
    tool_name: "Agent",
    tool_input: { prompt: `RD_REVIEW_REQUEST ${stage}` },
  }, env);
  assert.equal(reserved.code, 0, reserved.stderr);
  assert.doesNotMatch(reserved.stdout, /rejected/u);

  const started = await runHook("review-start", {
    cwd,
    session_id: session,
    agent_id: agentId,
    hook_event_name: "SubagentStart",
    agent_prompt: `RD_REVIEW_REQUEST ${stage}`,
  }, env);
  const context = parseOutput(started.stdout)?.hookSpecificOutput?.additionalContext ?? "";
  const nonce = /reviewNonce=([a-f0-9]+)/u.exec(context)?.[1];
  const anchorsMatch = /evidencePaths=(\[[^\]]*\])/u.exec(context);
  assert.ok(nonce, `missing review nonce in ${started.stdout || started.stderr}`);
  const anchors = anchorsMatch ? JSON.parse(anchorsMatch[1]) : [];

  const stopped = await runHook("subagent-stop", {
    cwd,
    session_id: session,
    agent_id: agentId,
    hook_event_name: "SubagentStop",
    last_assistant_message: `RD_REVIEW_RESULT ${JSON.stringify({
      stage,
      reviewNonce: nonce,
      decision: "approve",
      evidenceAnchors: anchors,
    })}`,
  }, env);
  assert.match(stopped.stdout, /approval recorded/u, stopped.stdout || stopped.stderr);
  return { nonce, agentId };
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

test("exact frame and challenge require an explicit control-assignment audit", () => {
  const exact = stages("exact");
  assert.equal(validateStage(exact.frame, manifest()).valid, true);
  assert.equal(validateStage(exact.challenge, manifest()).valid, true);

  const withoutRoles = stages("exact");
  delete withoutRoles.frame.payload.controlAssignments;
  assert.equal(validateStage(withoutRoles.frame, manifest()).valid, false);

  const withoutAttack = stages("exact");
  withoutAttack.challenge.payload.attacks = withoutAttack.challenge.payload.attacks.filter(
    (attack) => attack.kind !== "control-assignment",
  );
  assert.equal(validateStage(withoutAttack.challenge, manifest()).valid, false);
});

test("exact strategy variables cannot be assigned to the adversary", () => {
  const exact = stages("exact");
  exact.frame.payload.controlAssignments[0].controller = "adversary";
  assert.equal(validateStage(exact.frame, manifest()).valid, false);
});

test("exact frame requires an observability audit", () => {
  const exact = stages("exact");
  delete exact.frame.payload.observabilityAudit;
  assert.equal(validateStage(exact.frame, manifest()).valid, false);
});

test("exact frame cannot omit a given that exposes action-time observability", () => {
  const exact = stages("exact");
  exact.frame.payload.observabilityAudit[0] = {
    id: "O1",
    dimension: "hidden flavor",
    sourceRef: "A1",
    observable: false,
    controlEffect: "none",
    timing: "after selection",
    strategyRef: null,
    overrideSourceRef: null,
    implication: "flavor remains hidden",
  };
  const result = validateStage(exact.frame, manifest());
  assert.equal(result.valid, false);
  assert.match(result.findings.join("; "), /given G1 states action-time observability but lacks an observable audit/u);
});

test("observable allocation must reference an allocation strategy", () => {
  const exact = stages("exact");
  exact.frame.payload.strategyVariables[0].kind = "scalar";
  assert.equal(validateStage(exact.frame, manifest()).valid, false);
});

test("allocation strategies must name their independently fixed components", () => {
  const exact = stages("exact");
  delete exact.frame.payload.strategyVariables[0].components;
  assert.equal(validateStage(exact.frame, manifest()).valid, false);
});

test("exact analysis must evaluate a fixed strategy against environment variation", () => {
  const exact = stages("exact");
  delete exact.analysis.payload.strategyEvaluations;
  assert.equal(validateStage(exact.analysis, manifest()).valid, false);

  const deferred = stages("exact");
  deferred.analysis.payload.candidateAnswer = "";
  const result = validateStage(deferred.analysis, manifest());
  assert.match(result.findings.join("; "), /candidateAnswer must contain the current provisional answer; do not defer it/u);
});

test("control-assignment challenge must separate fixed strategy from varied environment", () => {
  const exact = stages("exact");
  const attack = exact.challenge.payload.attacks.find((item) => item.kind === "control-assignment");
  delete attack.fixedAssignment;
  assert.equal(validateStage(exact.challenge, manifest()).valid, false);
});

test("exact cross-check rejects a prose-only deterministic allocation search", () => {
  const exact = stages("exact");
  delete exact.crossCheck.payload.strategySearches[0].replayModel;
  assert.equal(validateStage(exact.crossCheck, manifest()).valid, false);
});

test("exact cross-check accepts supporting tool evidence without an allocation replay model", () => {
  const exact = stages("exact");
  exact.crossCheck.payload.strategySearches[0].answerBinding = "supporting";
  exact.crossCheck.payload.strategySearches[0].replayModel = null;
  exact.crossCheck.payload.strategySearches[0].objectiveValue = 0;
  exact.crossCheck.payload.strategySearches[0].result = "the selected policy has no counterexamples in the bounded probe";
  const result = validateStage(exact.crossCheck, manifest());
  assert.equal(result.valid, true, result.findings.join("; "));
});

test("finite replay rejects an excessive hidden response space before enumeration", () => {
  const exact = stages("exact");
  exact.crossCheck.payload.strategySearches[0].replayModel.responseGroups[0].members[0].capacity = 10000;
  const result = validateStage(exact.crossCheck, manifest());
  assert.equal(result.valid, false);
  assert.match(result.findings.join("; "), /response space exceeds the 1000000-combination replay limit/u);
});

test("observable selection may be blocked only by a given that explicitly forbids using the signal", () => {
  const blocked = stages("exact");
  blocked.frame.payload.givens.push({
    id: "G2",
    statement: "The participant cannot use touch to choose or select shapes while drawing.",
    source: "user-verbatim",
  });
  Object.assign(blocked.frame.payload.observabilityAudit[0], {
    controlEffect: "blocked",
    strategyRef: null,
    overrideSourceRef: "G2",
  });
  assert.equal(validateStage(blocked.frame, manifest()).valid, true);

  blocked.frame.payload.givens[1].source = "user prompt";
  assert.equal(validateStage(blocked.frame, manifest()).valid, false);

  blocked.frame.payload.givens[1].source = "user-verbatim";
  blocked.frame.payload.givens[1].statement = "The participant decides the total count before the activity.";
  const result = validateStage(blocked.frame, manifest());
  assert.equal(result.valid, false);
  assert.match(result.findings.join("; "), /must explicitly forbid using the observable signal/u);
});

test("hook rejects exact analysis that omits a framed strategy from exists quantifiers", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-strategy-coverage-data-"));
  const dir = workflowDir(root);
  const session = "strategy-coverage-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  const artifacts = stages("exact");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);

  const framePath = join(dir, "01-frame.md");
  writeArtifact(framePath, artifacts.frame);
  const frame = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: framePath } }, env);
  assert.match(frame.stdout, /RD-R1/u, frame.stdout || frame.stderr);

  artifacts.analysis.payload.model.quantifiers[0].strategyRefs = [];
  const analysisPath = join(dir, "02-analysis.md");
  writeArtifact(analysisPath, artifacts.analysis);
  const analysis = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: analysisPath } }, env);
  assert.match(analysis.stdout, /strategy S1 lacks an exists quantifier/u, analysis.stdout || analysis.stderr);
});

test("hook rejects strategy components that disappear across exact stages", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-strategy-components-data-"));
  const dir = workflowDir(root);
  const session = "strategy-components-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  const artifacts = stages("exact");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);

  const framePath = join(dir, "01-frame.md");
  writeArtifact(framePath, artifacts.frame);
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: framePath } }, env);

  artifacts.analysis.payload.model.quantifiers[0].variables = ["totalDraws"];
  const analysisPath = join(dir, "02-analysis.md");
  writeArtifact(analysisPath, artifacts.analysis);
  const analysis = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: analysisPath } }, env);
  assert.match(analysis.stdout, /component roundDraws lacks an exists quantifier variable/u, analysis.stdout || analysis.stderr);
});

test("hook rejects a control challenge that changes the fixed strategy", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-fixed-challenge-data-"));
  const dir = workflowDir(root);
  const session = "fixed-challenge-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  const artifacts = stages("exact");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);

  for (const [file, artifact] of [["01-frame.md", artifacts.frame], ["02-analysis.md", artifacts.analysis]]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    const result = await postStage(env, { cwd: root, session, path });
    assert.match(result.stdout, /RD-R[12]/u, result.stdout || result.stderr);
  }

  const attack = artifacts.challenge.payload.attacks.find((item) => item.kind === "control-assignment");
  attack.fixedAssignment = { totalDraws: 21 };
  const challengePath = join(dir, "03-challenge.md");
  writeArtifact(challengePath, artifacts.challenge);
  const challenge = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: challengePath } }, env);
  assert.match(challenge.stdout, /challenge must fix exactly: roundDraws, starDraws/u, challenge.stdout || challenge.stderr);
});

test("hook rejects replay models with an unknown source reference", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-replay-source-data-"));
  const dir = workflowDir(root);
  const session = "replay-source-session";
  const env = { PLUGIN_DATA: data };
  const artifacts = stages("exact");
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  for (const [file, artifact] of [
    ["01-frame.md", artifacts.frame],
    ["02-analysis.md", artifacts.analysis],
    ["03-challenge.md", artifacts.challenge],
  ]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    await postStage(env, { cwd: root, session, path });
  }

  artifacts.crossCheck.payload.strategySearches[0].replayModel.sourceRefs = ["G404"];
  const path = join(dir, "04-cross-check.md");
  writeArtifact(path, artifacts.crossCheck);
  const result = await postStage(env, { cwd: root, session, path });
  assert.match(result.stdout, /unknown claim reference G404/u, result.stdout || result.stderr);
});

test("hook rejects a replay objective that contradicts the analysis answer", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-replay-answer-data-"));
  const dir = workflowDir(root);
  const session = "replay-answer-session";
  const env = { PLUGIN_DATA: data };
  const artifacts = stages("exact");
  artifacts.analysis.payload.candidateAnswer = "27";
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  for (const [file, artifact] of [
    ["01-frame.md", artifacts.frame],
    ["02-analysis.md", artifacts.analysis],
    ["03-challenge.md", artifacts.challenge],
  ]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    await postStage(env, { cwd: root, session, path });
  }

  const path = join(dir, "04-cross-check.md");
  writeArtifact(path, artifacts.crossCheck);
  const result = await postStage(env, { cwd: root, session, path });
  assert.match(result.stdout, /replayed objective 21 must match analysis candidateAnswer 27/u, result.stdout || result.stderr);
});

test("hook rejects a nonnumeric analysis answer when a numeric replay exists", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-replay-nonnumeric-data-"));
  const dir = workflowDir(root);
  const session = "replay-nonnumeric-session";
  const env = { PLUGIN_DATA: data };
  const artifacts = stages("exact");
  artifacts.analysis.payload.candidateAnswer = "twenty-one";
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  for (const [file, artifact] of [
    ["01-frame.md", artifacts.frame],
    ["02-analysis.md", artifacts.analysis],
    ["03-challenge.md", artifacts.challenge],
  ]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    await postStage(env, { cwd: root, session, path });
  }

  const path = join(dir, "04-cross-check.md");
  writeArtifact(path, artifacts.crossCheck);
  const result = await postStage(env, { cwd: root, session, path });
  assert.match(result.stdout, /numeric replay requires a numeric analysis candidateAnswer/u, result.stdout || result.stderr);
});

test("hook rejects a conclusion that contradicts the replayed objective", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-replay-conclusion-data-"));
  const dir = workflowDir(root);
  const session = "replay-conclusion-session";
  const env = { PLUGIN_DATA: data };
  const artifacts = stages("exact");
  artifacts.conclusion.payload.conclusion = "27";
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  for (const [file, artifact] of [
    ["01-frame.md", artifacts.frame],
    ["02-analysis.md", artifacts.analysis],
    ["03-challenge.md", artifacts.challenge],
    ["04-cross-check.md", artifacts.crossCheck],
  ]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    await postStage(env, { cwd: root, session, path });
  }

  const path = join(dir, "05-conclusion.md");
  writeArtifact(path, artifacts.conclusion);
  const result = await postStage(env, { cwd: root, session, path });
  assert.match(result.stdout, /replayed objective 21 must match conclusion 27/u, result.stdout || result.stderr);
});

test("supporting numeric evidence does not replace a semantic algorithm conclusion", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-supporting-objective-data-"));
  const dir = workflowDir(root);
  const session = "supporting-objective-session";
  const env = { PLUGIN_DATA: data };
  const artifacts = stages("exact");
  const semanticConclusion = "use the wave-stable merge policy";
  artifacts.analysis.payload.candidateAnswer = semanticConclusion;
  artifacts.crossCheck.payload.strategySearches[0].answerBinding = "supporting";
  artifacts.conclusion.payload.conclusion = semanticConclusion;

  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);

  for (const [file, artifact, receipt] of [
    ["01-frame.md", artifacts.frame, "RD-R1"],
    ["02-analysis.md", artifacts.analysis, "RD-R2"],
    ["03-challenge.md", artifacts.challenge, "RD-R3"],
    ["04-cross-check.md", artifacts.crossCheck, "RD-R4"],
    ["05-conclusion.md", artifacts.conclusion, "RD-R5"],
  ]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    const result = await postStage(env, { cwd: root, session, path });
    assert.match(result.stdout, new RegExp(receipt, "u"), result.stdout || result.stderr);
  }
});

test("challenge stage is unsigned until an independent reviewer approval is bound", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-review-required-data-"));
  const dir = workflowDir(root);
  const session = "review-required-session";
  const env = { PLUGIN_DATA: data };
  writeArtifact(join(dir, "workflow.md"), manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: join(dir, "workflow.md") } }, env);
  for (const [name, value] of [["01-frame.md", stages().frame], ["02-analysis.md", stages().analysis]]) {
    const path = join(dir, name);
    writeArtifact(path, value);
    const signed = await postStage(env, { cwd: root, session, path });
    assert.match(signed.stdout, /RD-R[12]/u, signed.stdout || signed.stderr);
  }

  const challengePath = join(dir, "03-challenge.md");
  writeArtifact(challengePath, stages().challenge);
  const unsigned = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: challengePath } }, env);
  assert.match(unsigned.stdout, /RD_REVIEW_REQUEST challenge/u, unsigned.stdout || unsigned.stderr);
  assert.doesNotMatch(unsigned.stdout, /RD-R3/u);

  await approveIndependentReview(env, { cwd: root, session, stage: "challenge", agentId: "challenge-reviewer" });
  const signed = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: challengePath } }, env);
  assert.match(signed.stdout, /RD-R3/u, signed.stdout || signed.stderr);

  const reused = await runHook("review-start", {
    cwd: root,
    session_id: session,
    agent_id: "challenge-reviewer",
    hook_event_name: "SubagentStart",
    agent_prompt: "RD_REVIEW_REQUEST cross-check",
  }, env);
  await runHook("pre", {
    cwd: root,
    session_id: session,
    tool_name: "Agent",
    tool_input: { prompt: "RD_REVIEW_REQUEST cross-check" },
  }, env);
  const rebound = await runHook("review-start", {
    cwd: root,
    session_id: session,
    agent_id: "challenge-reviewer",
    hook_event_name: "SubagentStart",
    agent_prompt: "RD_REVIEW_REQUEST cross-check",
  }, env);
  assert.match(rebound.stdout, /different agent/u, `${reused.stdout}\n${rebound.stdout}`);
});

test("review-start directly reserves a request and embeds prior stages when dispatch PreToolUse is unavailable", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-direct-review-data-"));
  const dir = workflowDir(root);
  const session = "direct-review-session";
  const codexHome = mkdtempSync(join(tmpdir(), "reasoning-direct-codex-home-"));
  const transcriptPath = join(codexHome, "sessions", "child.jsonl");
  mkdirSync(join(codexHome, "sessions"), { recursive: true });
  const env = { PLUGIN_DATA: data, CODEX_HOME: codexHome };
  writeArtifact(join(dir, "workflow.md"), manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: join(dir, "workflow.md") } }, env);
  for (const [name, value] of [["01-frame.md", stages().frame], ["02-analysis.md", stages().analysis]]) {
    const path = join(dir, name);
    writeArtifact(path, value);
    await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: path } }, env);
  }

  writeFileSync(transcriptPath, `${JSON.stringify({ type: "session_meta", payload: {
    id: "direct-challenge-reviewer", parent_thread_id: session, cwd: root,
    thread_source: "subagent", agent_path: "/root/rd_challenge_case",
    source: { subagent: { thread_spawn: { parent_thread_id: session, depth: 1, agent_path: "/root/rd_challenge_case" } } },
  } })}\n`);
  const started = await runHook("review-start", {
    cwd: root,
    session_id: "direct-challenge-reviewer",
    agent_id: "direct-challenge-reviewer",
    hook_event_name: "SubagentStart",
    transcript_path: transcriptPath,
  }, env);
  const context = parseOutput(started.stdout)?.hookSpecificOutput?.additionalContext ?? "";
  assert.match(context, /reviewNonce=[a-f0-9]+/u);
  assert.match(context, /evidenceBundle=/u);
  assert.match(context, /reasoning-stage\/v1/u);
  const recorded = await runHook("subagent-stop", {
    cwd: root,
    session_id: "direct-challenge-reviewer",
    agent_id: "direct-challenge-reviewer",
    hook_event_name: "SubagentStop",
    transcript_path: transcriptPath,
    last_assistant_message: `RD_REVIEW_RESULT ${JSON.stringify({ stage: "challenge", reviewNonce: /reviewNonce=([a-f0-9]+)/u.exec(context)[1], decision: "approve", evidenceAnchors: ["01-frame.md"] })}`,
  }, env);
  assert.match(recorded.stdout, /approval recorded/u, recorded.stdout || recorded.stderr);
  const replay = await runHook("review-start", {
    cwd: root, session_id: session, agent_id: "second-reviewer", hook_event_name: "SubagentStart",
    agent_prompt: "RD_REVIEW_REQUEST challenge",
  }, env);
  assert.doesNotMatch(parseOutput(replay.stdout)?.hookSpecificOutput?.additionalContext ?? "", /reviewNonce=/u);
});

test("independent review rejects a forged nonce, a write from the reviewer, and a stale approval", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-review-adversarial-data-"));
  const dir = workflowDir(root);
  const session = "review-adversarial-session";
  const env = { PLUGIN_DATA: data };
  writeArtifact(join(dir, "workflow.md"), manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: join(dir, "workflow.md") } }, env);
  for (const [name, value] of [["01-frame.md", stages().frame], ["02-analysis.md", stages().analysis]]) {
    const path = join(dir, name);
    writeArtifact(path, value);
    await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: path } }, env);
  }

  await runHook("pre", { cwd: root, session_id: session, tool_name: "Agent", tool_input: { prompt: "RD_REVIEW_REQUEST challenge" } }, env);
  const started = await runHook("review-start", {
    cwd: root, session_id: session, agent_id: "challenge-reviewer",
    hook_event_name: "SubagentStart", agent_prompt: "RD_REVIEW_REQUEST challenge",
  }, env);
  const nonce = /reviewNonce=([a-f0-9]+)/u.exec(parseOutput(started.stdout)?.hookSpecificOutput?.additionalContext ?? "")?.[1];
  assert.ok(nonce);

  const forged = await runHook("subagent-stop", {
    cwd: root, session_id: session, agent_id: "challenge-reviewer", hook_event_name: "SubagentStop",
    last_assistant_message: `RD_REVIEW_RESULT ${JSON.stringify({
      stage: "challenge", reviewNonce: "ffffffffffffffff", decision: "approve", evidenceAnchors: ["01-frame.md"],
    })}`,
  }, env);
  assert.match(forged.stdout, /reviewNonce does not match|independent review result rejected/u, forged.stdout);

  const writeDenied = await runHook("pre", {
    cwd: root, session_id: session, agent_id: "challenge-reviewer",
    tool_name: "Write", tool_input: { file_path: join(dir, "03-challenge.md"), content: "nope\n" },
  }, env);
  assert.equal(parseOutput(writeDenied.stdout)?.hookSpecificOutput?.permissionDecision, "deny");

  const challenged = await runHook("subagent-stop", {
    cwd: root, session_id: session, agent_id: "challenge-reviewer", hook_event_name: "SubagentStop",
    last_assistant_message: `RD_REVIEW_RESULT ${JSON.stringify({
      stage: "challenge", reviewNonce: nonce, decision: "challenge", evidenceAnchors: ["01-frame.md"],
    })}`,
  }, env);
  assert.match(challenged.stdout, /challenge recorded/u, challenged.stdout);

  const unsigned = await runHook("post", {
    cwd: root, session_id: session, tool_name: "Write",
    tool_input: { file_path: join(dir, "03-challenge.md") },
  }, env);
  writeArtifact(join(dir, "03-challenge.md"), stages().challenge);
  const stillUnsigned = await runHook("post", {
    cwd: root, session_id: session, tool_name: "Write",
    tool_input: { file_path: join(dir, "03-challenge.md") },
  }, env);
  assert.match(`${unsigned.stdout}\n${stillUnsigned.stdout}`, /RD_REVIEW_REQUEST challenge/u);
  assert.doesNotMatch(stillUnsigned.stdout, /RD-R3/u);

  await approveIndependentReview(env, { cwd: root, session, stage: "challenge", agentId: "challenge-reviewer-2" });
  writeArtifact(join(dir, "03-challenge.md"), stages().challenge);
  const signed = await runHook("post", {
    cwd: root, session_id: session, tool_name: "Write",
    tool_input: { file_path: join(dir, "03-challenge.md") },
  }, env);
  assert.match(signed.stdout, /RD-R3/u, signed.stdout);

  writeArtifact(join(dir, "02-analysis.md"), stages().analysis);
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: join(dir, "02-analysis.md") } }, env);
  writeArtifact(join(dir, "03-challenge.md"), stages().challenge);
  const stale = await runHook("post", {
    cwd: root, session_id: session, tool_name: "Write",
    tool_input: { file_path: join(dir, "03-challenge.md") },
  }, env);
  assert.match(stale.stdout, /missing or stale/u, stale.stdout);
  assert.doesNotMatch(stale.stdout, /RD-R3/u);
});

test("SessionStart publishes a compact five-stage reasoning route", async () => {
  const root = workspace();
  const result = await runHook("session", {
    cwd: root,
    session_id: "routing-session",
  });

  assert.equal(result.code, 0, result.stderr);
  const output = parseOutput(result.stdout);
  const context = output?.hookSpecificOutput?.additionalContext ?? "";
  assert.equal(output?.hookSpecificOutput?.hookEventName, "SessionStart");
  assert.match(context, /`\$reasoning-discipline`/u);
  assert.match(context, /standing rule.*proof.*exact.*worst-case.*algorithmic.*causal.*constrained-decision.*must invoke.*reasoning-discipline.*finish five stages.*before replying.*final-only/iu);
  assert.ok(context.length <= 200, `SessionStart context is ${context.length} characters`);
  assert.doesNotMatch(context, /ordering|boundary|representation|observability|quantifier|strategy|workflow\.md/iu);
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
    const signed = await postStage(env, { cwd: root, session, path });
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

test("exact-payload conclusion blocks commentary around the requested payload", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-exact-output-data-"));
  const dir = workflowDir(root);
  const session = "exact-output-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);

  const artifacts = stages();
  artifacts.conclusion.payload.outputContract = { mode: "exact-payload" };
  for (const [file, artifact] of [
    ["01-frame.md", artifacts.frame],
    ["02-analysis.md", artifacts.analysis],
    ["03-challenge.md", artifacts.challenge],
    ["04-cross-check.md", artifacts.crossCheck],
    ["05-conclusion.md", artifacts.conclusion],
  ]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    await postStage(env, { cwd: root, session, path });
  }
  writeArtifact(workflowPath, manifest({
    status: "closed",
    currentStage: "conclusion",
    completionReceipt: "RD-R5",
    resume: { nextStage: null, nextAction: null },
  }));
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);

  const commentary = await runHook("stop", {
    cwd: root,
    session_id: session,
    last_assistant_message: "The corrected result is:\n21",
  }, env);
  assert.equal(parseOutput(commentary.stdout)?.decision, "block", commentary.stdout || commentary.stderr);
  assert.match(parseOutput(commentary.stdout)?.reason ?? "", /must exactly equal conclusion payload/u);

  const exact = await runHook("stop", {
    cwd: root,
    session_id: session,
    last_assistant_message: "21",
  }, env);
  assert.equal(exact.stdout, "", exact.stdout);
});

test("a corrected close clears stale manifest validation findings", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-close-recovery-data-"));
  const dir = workflowDir(root);
  const session = "close-recovery-session";
  const env = { PLUGIN_DATA: data };
  const workflowPath = join(dir, "workflow.md");
  writeArtifact(workflowPath, manifest());
  await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  const artifacts = stages();
  for (const [file, artifact] of [
    ["01-frame.md", artifacts.frame],
    ["02-analysis.md", artifacts.analysis],
    ["03-challenge.md", artifacts.challenge],
    ["04-cross-check.md", artifacts.crossCheck],
    ["05-conclusion.md", artifacts.conclusion],
  ]) {
    const path = join(dir, file);
    writeArtifact(path, artifact);
    await postStage(env, { cwd: root, session, path });
  }

  writeArtifact(workflowPath, {
    ...manifest({
      status: "closed",
      currentStage: "conclusion",
      completionReceipt: "RD-R5",
      resume: { nextStage: null, nextAction: null },
    }),
    statusConfirmed: true,
  });
  const rejected = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  assert.match(rejected.stdout, /unknown field statusConfirmed/u, rejected.stdout || rejected.stderr);

  writeArtifact(workflowPath, manifest({
    status: "closed",
    currentStage: "conclusion",
    completionReceipt: "RD-R5",
    resume: { nextStage: null, nextAction: null },
  }));
  const recovered = await runHook("post", { cwd: root, session_id: session, tool_name: "Write", tool_input: { file_path: workflowPath } }, env);
  assert.match(recovered.stdout, /Workflow closed with RD-R5/u, recovered.stdout || recovered.stderr);
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
  const accepted = await postStage(env, { cwd: root, session, path: crossCheckPath });
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

  const stateDir = join(root, ".reasoning-discipline", ".state");
  assert.equal(readdirSync(stateDir).filter((name) => name.endsWith(".json")).length, 1);
  assert.match(readFileSync(join(stateDir, readdirSync(stateDir).find((name) => name.endsWith(".json"))), "utf8"), /RW-20260809-candy/u);
  assert.equal(existsSync(join(data, "reasoning-discipline-guard")), false);
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

  const unknownCause = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "No root cause can be concluded without the failing response and logs; please provide them.",
  }, env);
  assert.equal(unknownCause.stdout, "");

  const artifactCitation = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "The premature 05-conclusion.md write was rejected. Recovery is recorded in the paused workflow path.",
  }, env);
  assert.equal(artifactCitation.stdout, "");

  const assertedCause = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "The root cause is a provider timeout.",
  }, env);
  assert.equal(parseOutput(assertedCause.stdout)?.decision, "block");

  const mixedDisclaimerAndClaim = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "I cannot verify the first answer, but the answer is 29.",
  }, env);
  assert.equal(parseOutput(mixedDisclaimerAndClaim.stdout)?.decision, "block");

  const unknownCauseZh = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "无法根据现有证据确定根因，请提供失败响应和日志。",
  }, env);
  assert.equal(unknownCauseZh.stdout, "");

  const assertedCauseZh = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "根因是提供方超时。",
  }, env);
  assert.equal(parseOutput(assertedCauseZh.stdout)?.decision, "block");

  const rejectedConclusionReport = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: [
      "The guard blocked the premature conclusion: invalid-stage: expected frame; received conclusion.",
      "No conclusion was presented. Claimed conclusion: none.",
      "The workflow is paused at frame and completionReceipt is null.",
    ].join("\n"),
  }, env);
  assert.equal(rejectedConclusionReport.stdout, "", rejectedConclusionReport.stdout);

  const detailedRecoveryReport = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: [
      "Recovery record for the paused workflow — this is a status report, not a conclusion:",
      "The deliberate attempt to write 05-conclusion.md before 01-frame.md was rejected by the guard.",
      "The ordered artifacts must be written in order before any conclusion is valid.",
      "No conclusion is claimed, and none is valid in this state.",
    ].join("\n"),
  }, env);
  assert.equal(detailedRecoveryReport.stdout, "", detailedRecoveryReport.stdout);

  const verifiedStateReport = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "The on-disk workflow state is verified. No conclusion is presented.",
  }, env);
  assert.equal(verifiedStateReport.stdout, "", verifiedStateReport.stdout);

  const verifiedPayload = await runHook("stop", {
    cwd: root,
    session_id: "paused",
    last_assistant_message: "Verified: 21",
  }, env);
  assert.equal(parseOutput(verifiedPayload.stdout)?.decision, "block");
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

test("session state lives under the workspace, not PLUGIN_DATA", async () => {
  const root = workspace();
  const data = mkdtempSync(join(tmpdir(), "reasoning-unused-data-"));
  const dir = workflowDir(root);
  const session = "workspace-state-session";
  const env = { PLUGIN_DATA: data, CLAUDE_PLUGIN_DATA: data };
  writeArtifact(join(dir, "workflow.md"), manifest());
  const bound = await runHook("post", {
    cwd: root,
    session_id: session,
    tool_name: "Write",
    tool_input: { file_path: join(dir, "workflow.md") },
  }, env);
  assert.match(bound.stdout, /Bound RW-20260809-candy/u, bound.stdout);

  const stateDir = join(root, ".reasoning-discipline", ".state");
  const files = readdirSync(stateDir).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 1);
  assert.equal(existsSync(join(data, "reasoning-discipline-guard")), false);
  assert.equal(readFileSync(join(stateDir, ".gitignore"), "utf8").trim(), "*");

  const noHostData = await runHook("stop", {
    cwd: root,
    session_id: session,
    last_assistant_message: "The answer is 21.",
  }, { PLUGIN_DATA: "", CLAUDE_PLUGIN_DATA: "" });
  assert.equal(parseOutput(noHostData.stdout)?.decision, "block");
});
