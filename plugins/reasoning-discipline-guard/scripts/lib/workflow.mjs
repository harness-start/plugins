import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

import {
  STAGES,
  STAGE_FILES,
  claimIds,
  loadManifest,
  loadStage,
  referencedIds,
} from "./artifacts.mjs";
import { emptyState, readState, updateState, writeState } from "./state-store.mjs";

function repoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

function relativePath(path, root) {
  return relative(root, resolve(path)).replaceAll(sep, "/");
}

export function isWorkflowManifestPath(path, root) {
  return /^\.reasoning-discipline\/[^/]+\/workflow\.md$/u.test(relativePath(path, root));
}

export function stageFromPath(path, root) {
  const rel = relativePath(path, root);
  const match = /^\.reasoning-discipline\/[^/]+\/(01-frame|02-analysis|03-challenge|04-cross-check|05-conclusion)\.md$/u.exec(rel);
  if (!match) return null;
  return Object.entries(STAGE_FILES).find(([, file]) => file === `${match[1]}.md`)?.[0] ?? null;
}

function workflowArtifact(path, workflowPath) {
  return dirname(resolve(path)) === dirname(resolve(workflowPath));
}

function ensureLocalExclude(root) {
  try {
    const path = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const absolute = resolve(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    if (!current.split(/\r?\n/u).includes("/.reasoning-discipline/")) {
      appendFileSync(absolute, `${current && !current.endsWith("\n") ? "\n" : ""}/.reasoning-discipline/\n`);
    }
  } catch {
    // Non-Git workspaces still support the artifact protocol.
  }
}

function priorClaims(state, includeCurrent = []) {
  return new Set([
    ...state.receipts.flatMap((receipt) => receipt.claimIds ?? []),
    ...includeCurrent,
  ]);
}

function referenceFindings(stage, state) {
  const currentClaims = claimIds(stage);
  const known = priorClaims(state, currentClaims);
  const findings = [];
  for (const reference of referencedIds(stage)) {
    if (!known.has(reference)) findings.push(`unknown claim reference ${reference}`);
  }
  const seen = new Set(state.receipts.flatMap((receipt) => receipt.claimIds ?? []));
  for (const id of currentClaims) {
    if (seen.has(id)) findings.push(`claim id ${id} duplicates an earlier stage`);
  }
  return findings;
}

function invalidateFrom(state, index) {
  state.receipts = state.receipts.filter((receipt) => receipt.stageIndex < index);
  state.nextStageIndex = index;
  state.status = "open";
  state.invalid = false;
  state.findings = [];
}

function receiptFor(stageIndex, check) {
  return {
    id: `RD-R${stageIndex + 1}`,
    stage: STAGES[stageIndex],
    stageIndex,
    path: check.path,
    sha256: check.sha256,
    claimIds: claimIds(check.value),
    at: Date.now(),
  };
}

function rebuildReceipts(state, manifest) {
  const declaredNext = manifest.status === "closed"
    ? null
    : manifest.resume?.nextStage ?? manifest.currentStage;
  const targetIndex = manifest.status === "closed"
    ? STAGES.length
    : STAGES.indexOf(declaredNext);
  if (targetIndex < 0) return [`cannot resume from unknown stage ${declaredNext}`];

  state.receipts = [];
  state.nextStageIndex = 0;
  state.invalid = false;
  state.findings = [];
  for (let index = 0; index < targetIndex; index += 1) {
    const stageName = STAGES[index];
    const path = resolve(dirname(state.workflowPath), STAGE_FILES[stageName]);
    const checked = loadStage(path, manifest);
    const findings = [...checked.findings];
    const previous = state.receipts.at(-1)?.id ?? null;
    if (checked.value?.previousReceipt !== previous) {
      findings.push(`${stageName}.previousReceipt must be ${previous ?? "null"}`);
    }
    if (checked.valid) findings.push(...referenceFindings(checked.value, state));
    if (findings.length > 0) return findings.map((finding) => `${stageName}: ${finding}`);
    state.receipts.push(receiptFor(index, checked));
    state.nextStageIndex = index + 1;
  }
  return [];
}

function bindManifest({ path, cwd, sessionId }) {
  const checked = loadManifest(path);
  if (!checked.valid) return { kind: "invalid-manifest", findings: checked.findings };
  const root = repoRoot(cwd);
  const state = {
    ...emptyState(),
    bound: true,
    workflowPath: resolve(path),
    workflowId: checked.value.id,
    branch: checked.value.branch,
    epoch: checked.value.run.epoch,
    status: checked.value.status,
    invalid: false,
  };
  const findings = rebuildReceipts(state, checked.value);
  if (findings.length > 0) {
    state.invalid = true;
    state.findings = findings;
    writeState(sessionId, cwd, state);
    return { kind: "invalid-resume", findings };
  }
  writeState(sessionId, cwd, state);
  ensureLocalExclude(root);
  return { kind: "bound", state, manifest: checked.value, root };
}

function refreshManifest({ path, cwd, sessionId, state }) {
  const checked = loadManifest(path);
  if (!checked.valid) {
    state.invalid = true;
    state.findings = checked.findings;
    writeState(sessionId, cwd, state);
    return { kind: "invalid-manifest", findings: checked.findings };
  }
  if (checked.value.id !== state.workflowId) {
    return { kind: "invalid-manifest", findings: ["bound workflow.id cannot change"] };
  }
  if (checked.value.branch !== state.branch) {
    return { kind: "invalid-manifest", findings: ["bound workflow.branch cannot change"] };
  }
  if (checked.value.run.epoch < state.epoch) {
    state.invalid = true;
    state.findings = ["workflow.run.epoch cannot decrease"];
    writeState(sessionId, cwd, state);
    return { kind: "invalid-manifest", findings: state.findings };
  }

  if (checked.value.run.epoch > state.epoch) {
    const findings = rebuildReceipts(state, checked.value);
    if (findings.length > 0) {
      state.invalid = true;
      state.findings = findings;
      writeState(sessionId, cwd, state);
      return { kind: "invalid-resume", findings };
    }
  }
  state.epoch = checked.value.run.epoch;
  state.status = checked.value.status;
  if (checked.value.status === "closed") {
    const findings = completionFindings({ cwd, sessionId, state, manifest: checked.value });
    if (findings.length > 0) {
      state.invalid = true;
      state.findings = findings;
      writeState(sessionId, cwd, state);
      return { kind: "invalid-close", findings };
    }
  }
  state.invalid = false;
  state.findings = [];
  writeState(sessionId, cwd, state);
  return { kind: checked.value.status === "closed" ? "closed" : "refreshed", manifest: checked.value };
}

function signStage({ path, cwd, sessionId, state }) {
  const root = repoRoot(cwd);
  const stageName = stageFromPath(path, root);
  if (!stageName || !workflowArtifact(path, state.workflowPath)) return { kind: "skip" };
  const index = STAGES.indexOf(stageName);
  if (index < state.nextStageIndex) invalidateFrom(state, index);
  const expected = STAGES[state.nextStageIndex];
  if (stageName !== expected) {
    state.invalid = true;
    state.findings = [`expected ${expected}; received ${stageName}`];
    writeState(sessionId, cwd, state);
    return { kind: "invalid-stage", findings: state.findings };
  }

  const manifestCheck = loadManifest(state.workflowPath);
  if (!manifestCheck.valid) return { kind: "invalid-stage", findings: manifestCheck.findings };
  const checked = loadStage(path, manifestCheck.value);
  const findings = [...checked.findings];
  const previous = state.receipts.at(-1)?.id ?? null;
  if (checked.value?.previousReceipt !== previous) {
    findings.push(`${stageName}.previousReceipt must be ${previous ?? "null"}`);
  }
  if (checked.valid) findings.push(...referenceFindings(checked.value, state));
  if (findings.length > 0) {
    state.invalid = true;
    state.findings = findings;
    writeState(sessionId, cwd, state);
    return { kind: "invalid-stage", findings };
  }

  const receipt = receiptFor(index, checked);
  state.receipts.push(receipt);
  state.nextStageIndex = index + 1;
  state.status = "open";
  state.invalid = false;
  state.findings = [];
  writeState(sessionId, cwd, state);
  return { kind: "signed", receipt, nextStage: STAGES[index + 1] ?? "close-workflow" };
}

export function processArtifactMutation({ cwd, sessionId, paths }) {
  const root = repoRoot(cwd);
  const relevant = [...new Set(paths.map((path) => resolve(path)))].filter((path) => (
    isWorkflowManifestPath(path, root) || stageFromPath(path, root)
  ));
  if (relevant.length === 0) return { kind: "idle" };

  let state = readState(sessionId, cwd);
  if (!state.bound) {
    const manifests = relevant.filter((path) => isWorkflowManifestPath(path, root));
    if (manifests.length !== 1 || relevant.length !== 1) {
      return { kind: "activation-rejected", findings: ["activate with exactly one workflow.md mutation before stage files"] };
    }
    return bindManifest({ path: manifests[0], cwd, sessionId });
  }

  const workflowPaths = relevant.filter((path) => resolve(path) === resolve(state.workflowPath));
  const stagePaths = relevant.filter((path) => stageFromPath(path, root));
  if (workflowPaths.length > 0 && stagePaths.length > 0) {
    return { kind: "invalid-stage", findings: ["one mutation event cannot update workflow.md and a stage together"] };
  }
  if (stagePaths.length > 1) {
    return { kind: "invalid-stage", findings: ["one mutation event can sign only one reasoning stage"] };
  }
  if (workflowPaths.length === 1) {
    return refreshManifest({ path: workflowPaths[0], cwd, sessionId, state });
  }
  if (stagePaths.length === 1) {
    return signStage({ path: stagePaths[0], cwd, sessionId, state });
  }
  return { kind: "idle" };
}

export function completionFindings({ cwd, sessionId, state = null, manifest = null }) {
  const live = state ?? readState(sessionId, cwd);
  if (!live.bound) return [];
  const findings = [];
  const manifestCheck = loadManifest(live.workflowPath);
  if (!manifestCheck.valid) return manifestCheck.findings;
  const current = manifest ?? manifestCheck.value;
  if (current.id !== live.workflowId) findings.push("workflow.id differs from the bound workflow");
  if (current.branch !== live.branch) findings.push("workflow.branch differs from the bound workflow");
  if (current.run.epoch !== live.epoch) findings.push("workflow.run.epoch differs from the bound epoch");
  if (current.status !== "closed") findings.push(`workflow status is ${current.status}; set paused, aborted, or complete all stages and close it`);
  if (live.invalid) findings.push(...live.findings);
  if (live.receipts.length !== STAGES.length) findings.push(`expected ${STAGES.length} stage receipts; found ${live.receipts.length}`);
  for (const [index, stageName] of STAGES.entries()) {
    const receipt = live.receipts[index];
    if (!receipt || receipt.id !== `RD-R${index + 1}` || receipt.stage !== stageName) {
      findings.push(`missing ordered receipt RD-R${index + 1} for ${stageName}`);
      continue;
    }
    const path = resolve(dirname(live.workflowPath), STAGE_FILES[stageName]);
    const checked = loadStage(path, current);
    if (!checked.valid) findings.push(...checked.findings.map((item) => `${stageName}: ${item}`));
    else if (checked.sha256 !== receipt.sha256) findings.push(`${stageName} changed after ${receipt.id}; rewrite it to re-sign downstream stages`);
  }
  if (current.completionReceipt !== "RD-R5") findings.push("closed workflow.completionReceipt must be RD-R5");
  return [...new Set(findings)];
}

function looksLikeConclusionClaim(message) {
  return /\b(?:answer|conclusion|therefore|verified|proven|root cause|recommend(?:ation|ed)?)\b|\u7b54\u6848|\u7ed3\u8bba|\u56e0\u6b64|\u6839\u56e0|\u5efa\u8bae/iu.test(
    String(message ?? ""),
  );
}

export function stopDecision({ cwd, sessionId, assistantMessage = "" }) {
  const state = readState(sessionId, cwd);
  if (!state.bound) return { kind: "idle" };
  const checked = loadManifest(state.workflowPath);
  if (!checked.valid) return { kind: "block", findings: checked.findings };
  if (["paused", "aborted"].includes(checked.value.status)) {
    if (looksLikeConclusionClaim(assistantMessage)) {
      return {
        kind: "block",
        findings: [`${checked.value.status} workflow cannot accompany a conclusion claim`],
      };
    }
    return { kind: "allow" };
  }
  const findings = completionFindings({ cwd, sessionId, state, manifest: checked.value });
  return findings.length === 0 ? { kind: "allow" } : { kind: "block", findings };
}

export function discoverWorkflows(cwd) {
  const root = repoRoot(cwd);
  try {
    const output = execFileSync(
      "find",
      [resolve(root, ".reasoning-discipline"), "-mindepth", "2", "-maxdepth", "2", "-name", "workflow.md", "-type", "f", "-print"],
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.split(/\r?\n/u).filter(Boolean).sort();
  } catch {
    return [];
  }
}
