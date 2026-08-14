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
import {
  REVIEW_STAGES,
  bindReviewer,
  clearReviewsFrom,
  observeReview,
  reserveReview,
  reviewEvidenceSnapshot,
  reviewEvidencePaths,
  reviewFingerprint,
  reviewRequirement,
  reviewerBinding,
} from "./independent-review.mjs";
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

function referenceFindings(stage, state, manifest) {
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
  if (manifest?.branch === "exact" && stage?.stage === "analysis") {
    const framePath = resolve(dirname(state.workflowPath), STAGE_FILES.frame);
    const frame = loadStage(framePath, manifest);
    if (!frame.valid) {
      findings.push("cannot audit analysis strategy coverage because frame is invalid");
    } else {
      const covered = new Set(
        (stage.payload?.model?.quantifiers ?? [])
          .filter((item) => item.kind === "exists")
          .flatMap((item) => item.strategyRefs ?? []),
      );
      const existsQuantifiers = stage.payload?.model?.quantifiers?.filter((item) => item.kind === "exists") ?? [];
      const forallVariables = new Set(
        (stage.payload?.model?.quantifiers ?? [])
          .filter((item) => item.kind === "forall")
          .flatMap((item) => item.variables ?? []),
      );
      const evaluations = stage.payload?.strategyEvaluations ?? [];
      for (const strategy of frame.value?.payload?.strategyVariables ?? []) {
        const strategyId = strategy.id;
        if (!covered.has(strategyId)) findings.push(`strategy ${strategyId} lacks an exists quantifier`);
        const quantifiedVariables = new Set(
          existsQuantifiers
            .filter((item) => item.strategyRefs?.includes(strategyId))
            .flatMap((item) => item.variables ?? []),
        );
        for (const component of strategy.components ?? []) {
          if (!quantifiedVariables.has(component)) findings.push(`strategy ${strategyId} component ${component} lacks an exists quantifier variable`);
        }
        const strategyEvaluations = evaluations.filter((item) => item.strategyRef === strategyId);
        if (strategyEvaluations.length === 0) findings.push(`strategy ${strategyId} lacks a fixed strategy evaluation`);
        for (const evaluation of strategyEvaluations) {
          const assignmentKeys = Object.keys(evaluation.fixedAssignment ?? {}).sort();
          const componentKeys = [...(strategy.components ?? [])].sort();
          if (assignmentKeys.join("\u0000") !== componentKeys.join("\u0000")) {
            findings.push(`strategy ${strategyId} evaluation must fix exactly: ${componentKeys.join(", ")}`);
          }
          if (!(evaluation.variedEnvironment ?? []).some((item) => forallVariables.has(item))) {
            findings.push(`strategy ${strategyId} evaluation must vary a forall environment variable`);
          }
        }
      }
    }
  }
  if (manifest?.branch === "exact" && stage?.stage === "challenge") {
    const frame = loadStage(resolve(dirname(state.workflowPath), STAGE_FILES.frame), manifest);
    const analysis = loadStage(resolve(dirname(state.workflowPath), STAGE_FILES.analysis), manifest);
    if (!frame.valid || !analysis.valid) {
      findings.push("cannot audit fixed control challenge because prior exact stages are invalid");
    } else {
      const forallVariables = new Set(
        (analysis.value?.payload?.model?.quantifiers ?? [])
          .filter((item) => item.kind === "forall")
          .flatMap((item) => item.variables ?? []),
      );
      const attacks = stage.payload?.attacks?.filter((item) => item.kind === "control-assignment") ?? [];
      for (const strategy of frame.value?.payload?.strategyVariables ?? []) {
        const strategyAttacks = attacks.filter((item) => item.strategyRef === strategy.id);
        if (strategyAttacks.length === 0) findings.push(`strategy ${strategy.id} lacks a control-assignment attack`);
        for (const attack of strategyAttacks) {
          const assignmentKeys = Object.keys(attack.fixedAssignment ?? {}).sort();
          const componentKeys = [...(strategy.components ?? [])].sort();
          if (assignmentKeys.join("\u0000") !== componentKeys.join("\u0000")) {
            findings.push(`strategy ${strategy.id} challenge must fix exactly: ${componentKeys.join(", ")}`);
          }
          if (!(attack.variedEnvironment ?? []).some((item) => forallVariables.has(item))) {
            findings.push(`strategy ${strategy.id} challenge must vary a forall environment variable`);
          }
        }
      }
    }
  }
  if (manifest?.branch === "exact" && stage?.stage === "cross-check") {
    const frame = loadStage(resolve(dirname(state.workflowPath), STAGE_FILES.frame), manifest);
    const analysis = loadStage(resolve(dirname(state.workflowPath), STAGE_FILES.analysis), manifest);
    if (!frame.valid || !analysis.valid) {
      findings.push("cannot audit strategy search because prior exact stages are invalid");
    } else {
      const forallVariables = new Set(
        (analysis.value?.payload?.model?.quantifiers ?? [])
          .filter((item) => item.kind === "forall")
          .flatMap((item) => item.variables ?? []),
      );
      const searches = stage.payload?.strategySearches ?? [];
      const evaluations = analysis.value?.payload?.strategyEvaluations ?? [];
      const candidateAnswer = Number(analysis.value?.payload?.candidateAnswer);
      const replaySearches = searches.filter((search) => (
        search.answerBinding === "objective"
        && search.replayModel
        && Number.isFinite(search.objectiveValue)
      ));
      if (replaySearches.length > 0 && !Number.isFinite(candidateAnswer)) {
        findings.push("numeric replay requires a numeric analysis candidateAnswer");
      } else if (replaySearches.length > 0 && !replaySearches.some((search) => search.objectiveValue === candidateAnswer)) {
        const objectives = [...new Set(searches.map((search) => search.objectiveValue))]
          .filter(Number.isFinite)
          .join(", ");
        findings.push(`replayed objective ${objectives || "is missing"} must match analysis candidateAnswer ${analysis.value.payload.candidateAnswer}`);
      }
      for (const strategy of frame.value?.payload?.strategyVariables?.filter((item) => item.kind === "allocation") ?? []) {
        const strategySearches = searches.filter((item) => item.strategyRef === strategy.id);
        if (strategySearches.length === 0) findings.push(`allocation strategy ${strategy.id} lacks an independent strategy search`);
        for (const search of strategySearches) {
          if (!search.replayModel) {
            findings.push(`allocation strategy ${strategy.id} requires a replayModel`);
          }
          const componentKeys = [...(strategy.components ?? [])].sort();
          const searchedKeys = [...(search.searchedComponents ?? [])].sort();
          const assignmentKeys = Object.keys(search.bestAssignment ?? {}).sort();
          if (searchedKeys.join("\u0000") !== componentKeys.join("\u0000")) {
            findings.push(`allocation strategy ${strategy.id} search must cover exactly: ${componentKeys.join(", ")}`);
          }
          if (assignmentKeys.join("\u0000") !== componentKeys.join("\u0000")) {
            findings.push(`allocation strategy ${strategy.id} best assignment must set exactly: ${componentKeys.join(", ")}`);
          }
          if (!(search.variedEnvironment ?? []).some((item) => forallVariables.has(item))) {
            findings.push(`allocation strategy ${strategy.id} search must vary a forall environment variable`);
          }
          const bestFingerprint = JSON.stringify(Object.entries(search.bestAssignment ?? {}).sort(([left], [right]) => left.localeCompare(right)));
          const matchedEvaluation = evaluations.some((evaluation) => (
            evaluation.strategyRef === strategy.id
            && JSON.stringify(Object.entries(evaluation.fixedAssignment ?? {}).sort(([left], [right]) => left.localeCompare(right))) === bestFingerprint
          ));
          if (!matchedEvaluation) findings.push(`allocation strategy ${strategy.id} best assignment lacks a matching analysis evaluation`);
        }
      }
    }
  }
  if (manifest?.branch === "exact" && stage?.stage === "conclusion") {
    const crossCheck = loadStage(resolve(dirname(state.workflowPath), STAGE_FILES["cross-check"]), manifest);
    if (!crossCheck.valid) {
      findings.push("cannot audit conclusion against replay because cross-check is invalid");
    } else {
      const objectives = (crossCheck.value?.payload?.strategySearches ?? [])
        .filter((search) => (
          search.answerBinding === "objective"
          && search.replayModel
          && Number.isFinite(search.objectiveValue)
        ))
        .map((search) => search.objectiveValue);
      if (objectives.length > 0) {
        const conclusion = Number(stage.payload?.conclusion);
        const uniqueObjectives = [...new Set(objectives)];
        if (!Number.isFinite(conclusion)) {
          findings.push("numeric replay requires a numeric conclusion");
        } else if (!uniqueObjectives.includes(conclusion)) {
          findings.push(`replayed objective ${uniqueObjectives.join(", ")} must match conclusion ${stage.payload.conclusion}`);
        }
      }
    }
  }
  return findings;
}

function invalidateFrom(state, index) {
  state.receipts = state.receipts.filter((receipt) => receipt.stageIndex < index);
  state.nextStageIndex = index;
  state.status = "open";
  state.invalid = false;
  state.findings = [];
  clearReviewsFrom(state, STAGES[index]);
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
    if (checked.valid) findings.push(...referenceFindings(checked.value, state, manifest));
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
    state.invalid = false;
    state.findings = [];
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
  if (checked.valid) findings.push(...referenceFindings(checked.value, state, manifestCheck.value));
  if (findings.length > 0) {
    state.invalid = true;
    state.findings = findings;
    writeState(sessionId, cwd, state);
    return { kind: "invalid-stage", findings };
  }

  const reviewFinding = reviewRequirement(state, stageName, state.workflowPath);
  if (reviewFinding) {
    return { kind: "review-required", findings: [reviewFinding] };
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
  for (const stage of ["challenge", "cross-check"]) {
    const reviewFinding = reviewRequirement(live, stage, live.workflowPath);
    if (reviewFinding) findings.push(reviewFinding);
  }
  return [...new Set(findings)];
}

function looksLikeExplicitConclusionClaim(message) {
  const assertions = [
    /\b(?:verified|proven|final)\s+(?:answer|conclusion|result|value|root cause|recommendation)\s*(?:is|[:\uff1a])\s*\S/iu,
    /\bverified\s*[:\uff1a]\s*(?!none\b|null\b|unknown\b)\S/iu,
    /\b(?:answer|conclusion|root cause)\s+is\s+(?!(?:valid|invalid|unknown|unsupported|unverified)\b)\S/iu,
    /(?:\u5df2\u9a8c\u8bc1|\u5df2\u8bc1\u660e)(?:\u7684)?(?:\u7b54\u6848|\u7ed3\u8bba|\u7ed3\u679c|\u6570\u503c|\u6839\u56e0)\s*(?:\u662f|\u4e3a|[:\uff1a])\s*\S/u,
    /(?:\u7b54\u6848|\u7ed3\u8bba|\u6839\u56e0)\s*(?:\u662f|\u4e3a|[:\uff1a])\s*\S/u,
  ];
  const uncertainty = [
    /\b(?:no|not|cannot|can't|could not|couldn't|unknown|unverified|unproven|unsupported)\b/iu,
    /(?:\u5c1a\u672a|\u4ecd\u672a|\u672a\u80fd|\u65e0\u6cd5|\u4e0d\u80fd|\u4e0d\u786e\u5b9a|\u4e0d\u5b58\u5728|\u4e0d\u662f|\u672a\u5f62\u6210|\u6ca1\u6709\u8bc1\u636e)/u,
  ];
  return String(message ?? "")
    .replace(/`[^`\r\n]+`/gu, " ")
    .split(/(?<=[.!?;\u3002\uff01\uff1f\uff1b])|\r?\n|\b(?:but|however|yet)\b|(?:\u4f46\u662f|\u4e0d\u8fc7|\u7136\u800c|\u4f46)/giu)
    .some((sentence) => assertions.some((pattern) => pattern.test(sentence)) && !uncertainty.some((pattern) => pattern.test(sentence)));
}

export function stopDecision({ cwd, sessionId, assistantMessage = "" }) {
  const state = readState(sessionId, cwd);
  if (!state.bound) return { kind: "idle" };
  const checked = loadManifest(state.workflowPath);
  if (!checked.valid) return { kind: "block", findings: checked.findings };
  if (["paused", "aborted"].includes(checked.value.status)) {
    if (looksLikeExplicitConclusionClaim(assistantMessage)) {
      return {
        kind: "block",
        findings: [`${checked.value.status} workflow cannot claim an explicit verified conclusion`],
      };
    }
    return { kind: "allow" };
  }
  const findings = completionFindings({ cwd, sessionId, state, manifest: checked.value });
  if (findings.length === 0) {
    const conclusionPath = resolve(dirname(state.workflowPath), STAGE_FILES.conclusion);
    const conclusion = loadStage(conclusionPath, checked.value);
    if (
      conclusion.valid
      && conclusion.value.payload.outputContract.mode === "exact-payload"
      && String(assistantMessage).trim() !== conclusion.value.payload.conclusion.trim()
    ) {
      findings.push(`final response must exactly equal conclusion payload ${JSON.stringify(conclusion.value.payload.conclusion.trim())}`);
    }
  }
  return findings.length === 0 ? { kind: "allow" } : { kind: "block", findings };
}

export function reserveIndependentReview({ cwd, sessionId, stage, toolUseId }) {
  return updateState(sessionId, cwd, (state) => {
    if (!state.bound) return { kind: "rejected", reason: "no bound reasoning workflow" };
    return reserveReview(state, { stage, fingerprint: reviewFingerprint(state.workflowPath, stage), toolUseId });
  }).result;
}

export function bindIndependentReviewer({ cwd, sessionId, stage, agentId }) {
  const { state, result } = updateState(sessionId, cwd, (next) => {
    if (!next.bound) return { kind: "rejected", reason: "no bound reasoning workflow" };
    return bindReviewer(next, { stage, agentId });
  });
  return {
    ...result,
    evidencePaths: reviewEvidencePaths(state.workflowPath, stage),
    workflowPath: state.workflowPath,
  };
}

export function reserveAndBindIndependentReviewer({ cwd, sessionId, stage, agentId, toolUseId }) {
  const initial = readState(sessionId, cwd);
  if (!initial.bound) return { kind: "rejected", reason: "no bound reasoning workflow" };
  const snapshot = reviewEvidenceSnapshot(initial.workflowPath, stage);
  if (!snapshot) return { kind: "rejected", reason: "review evidence snapshot is unavailable" };
  return updateState(sessionId, cwd, (state) => {
    if (!state.bound || state.workflowPath !== initial.workflowPath) return { kind: "rejected", reason: "reasoning workflow changed before reviewer bind" };
    if (reviewFingerprint(state.workflowPath, stage) !== snapshot.fingerprint) return { kind: "rejected", reason: "review evidence changed before reviewer bind" };
    const draft = structuredClone(state);
    const reserved = reserveReview(draft, { stage, fingerprint: snapshot.fingerprint, toolUseId });
    if (reserved.kind !== "reserved") return reserved;
    const bound = bindReviewer(draft, { stage, agentId });
    if (bound.kind !== "bound-reviewer") return bound;
    Object.assign(state, draft);
    return { ...bound, evidencePaths: snapshot.paths, evidenceBundle: snapshot.bundle };
  }).result;
}

export function observeIndependentReview({ cwd, sessionId, agentId, result }) {
  return updateState(sessionId, cwd, (state) => observeReview(state, { agentId, result })).result;
}

export function independentReviewerBinding({ cwd, sessionId, agentId }) {
  return reviewerBinding(readState(sessionId, cwd), agentId);
}

export function pendingReviewReservation({ cwd, sessionId }) {
  const state = readState(sessionId, cwd);
  for (const stage of Object.keys(REVIEW_STAGES)) {
    const reservation = state.reviews?.[stage]?.reservation;
    if (reservation && ["reserved", "bound"].includes(reservation.state)) return reservation;
  }
  return null;
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
