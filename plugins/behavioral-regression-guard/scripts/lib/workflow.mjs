import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { isContractPath, loadContract, normalizeCommand, planDigest } from "./contract.mjs";
import { fingerprintPaths } from "./fingerprint.mjs";
import { armedProbeWorkspaceFindings } from "./probe-gate.mjs";
import { newRun, readRun, readSession, writeRun, writeSession } from "./state-store.mjs";

const CHALLENGE_INPUT_PROMPT = "state the concrete challenge input";
const CHALLENGE_EXPECTED_PROMPT = "derive independently from task and evidence";
const CHALLENGE_ALTERNATIVE_PROMPT = "derive the contrasted shortcut outcome independently";
const REPRESENTATION_GRAMMAR = "Canonical descriptor: container:length=<n>[;items=container:length=<n>]. Derive names from source-language semantics: a Python bracket comprehension is list, a tuple literal is tuple, and a NumPy slice or reshape is array. The JSON value must mirror the descriptor nesting and every declared length. Derive all names, nesting, and lengths from source evidence, with no prose inside the descriptor.";

function repoRoot(cwd) {
  try { return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return resolve(cwd); }
}

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function rel(root, path) { return relative(root, resolve(path)).replaceAll("\\", "/") || "."; }
function verificationPaths(contract) { return [...contract.scope.verificationPaths, ...(contract.scope.regressionPaths ?? [])]; }

function rawJsonValueShape(value) {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => typeof item === "string")) return "array-of-strings";
    if (value.length > 0 && value.every((item) => typeof item === "number")) return "array-of-numbers";
    if (value.length > 0 && value.every((item) => typeof item === "boolean")) return "array-of-booleans";
    return "array";
  }
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  const fields = Object.keys(value).sort().map((key) => `${key}:${rawJsonValueShape(value[key])}`);
  return `object{${fields.join(",")}}`;
}

function hasAdvertisedJsonShape(value, reference) {
  return rawJsonValueShape(value) === rawJsonValueShape(reference);
}

function hasCanonicalRepresentationValue(sample) {
  if (typeof sample?.representation !== "string") return false;
  const descriptor = /^(array|list|tuple):length=(\d+)(?:;items=(array|list|tuple):length=(\d+))?$/u.exec(sample.representation);
  if (!descriptor) return false;
  if (sample.value === null) return true;
  if (!Array.isArray(sample.value) || sample.value.length !== Number(descriptor[2])) return false;
  if (descriptor[4] !== undefined && !sample.value.every((item) => Array.isArray(item) && item.length === Number(descriptor[4]))) return false;
  return true;
}

function taskAnchorSemanticFindings(contract, taskAnchorText) {
  if (!taskAnchorText) return [];
  const semantics = new Set(contract?.surface?.semantics ?? []);
  const required = [];
  if (/\b(?:order|ordered|ordering|sequence|dependency|dependencies|topological|precedence)\b/iu.test(taskAnchorText)) required.push("ordering");
  if (/\b(?:representation|container|tuple|deduplicate|deduplication)\b|\b(?:array|list)\s+shape\b|\bshape\s+matches\b|\b(?:return(?:s|ed|ing)?|produce(?:s|d|ing)?|yield(?:s|ed|ing)?)\b[^\n]{0,40}\b(?:array|list|tuple|container)\b/iu.test(taskAnchorText)) required.push("representation");
  const findings = required.filter((semantic) => !semantics.has(semantic))
    .map((semantic) => `original user task requires surface.semantics to include ${semantic}`);
  const explicitCoupling = /\b(?:only|must|required|valid)\b[^.\n]{0,100}\b(?:together|jointly|simultaneously)\b/iu.test(taskAnchorText)
    || /\bpartial(?:-|\s)?(?:degenerate|empty|missing)\b[^.\n]{0,100}\b(?:invalid|unsupported|forbidden|not allowed)\b/iu.test(taskAnchorText);
  if (contract?.surface?.interactionModel === "coupled-boundary" && !explicitCoupling) {
    findings.push("original user task does not establish that partial-degenerate components are invalid; use component-matrix with each-one-degenerate cases unless the task explicitly requires components to degenerate together");
  }
  return findings;
}

function persistBinding({ sessionId, root, path, contract, invalidReason = null }) {
  writeSession(sessionId, root, {
    bound: true,
    contractPath: resolve(path),
    contractId: contract?.id ?? null,
    epoch: contract?.epoch ?? null,
    invalidReason,
  });
}

function bindInvalid({ sessionId, root, path, contract = null, findings }) {
  persistBinding({ sessionId, root, path, contract, invalidReason: findings.join("; ") });
  return { kind: "invalid", repoRoot: root, path, contract, findings };
}

export function bindContractAfterMutation({ cwd, sessionId, touchedPaths, reviewMode = "advisory", taskAnchorText = null }) {
  const root = repoRoot(cwd);
  const candidates = [...new Set(touchedPaths.map((path) => resolve(path)))].filter((path) => isContractPath(path, root));
  if (candidates.length === 0) return { kind: "idle" };
  if (candidates.length > 1) return { kind: "invalid", findings: ["one hook event cannot bind multiple behavioral regression contracts"] };
  const path = candidates[0];
  const checked = loadContract(path);
  if (!checked.valid) {
    const taskFindings = checked.contract ? taskAnchorSemanticFindings(checked.contract, taskAnchorText) : [];
    return bindInvalid({ sessionId, root, path, contract: checked.contract, findings: [...new Set([...taskFindings, ...checked.findings])] });
  }
  const contract = checked.contract;
  const taskFindings = taskAnchorSemanticFindings(contract, taskAnchorText);
  if (taskFindings.length > 0) return bindInvalid({ sessionId, root, path, contract, findings: taskFindings });
  const probeWorkspaceFindings = armedProbeWorkspaceFindings({
    cwd: root,
    sessionId,
    allowedPaths: [rel(root, path), ...contract.scope.verificationPaths],
  });
  if (probeWorkspaceFindings.length > 0) return bindInvalid({ sessionId, root, path, contract, findings: probeWorkspaceFindings });
  const production = fingerprintPaths(root, contract.scope.productionPaths);
  if (!production.ok) return bindInvalid({ sessionId, root, path, contract, findings: production.findings });
  const plan = planDigest(contract);
  const stored = readRun(root, contract.id);
  let run;
  let kind = "bound";

  if (stored.kind === "corrupt") return bindInvalid({ sessionId, root, path, contract, findings: ["stored run state is corrupt"] });
  if (stored.kind === "missing") {
    run = newRun({ contract, path, plan, productionFingerprint: production.digest, sessionId, reviewMode, taskAnchorText });
  } else {
    run = stored.value;
    if (resolve(run.contractPath) !== resolve(path)) return bindInvalid({ sessionId, root, path, contract, findings: ["contract id is already bound to another path"] });
    if (contract.epoch < run.epoch) return bindInvalid({ sessionId, root, path, contract, findings: [`epoch must not move backward from ${run.epoch}`] });
    if (contract.epoch === run.epoch && run.lease?.active && run.lease.sessionId !== sessionId) return { kind: "conflict", findings: ["contract has an active lease in another session"] };

    if (contract.epoch > run.epoch) {
      if (run.lease?.active && run.lease.sessionId !== sessionId) return { kind: "conflict", findings: ["pause or abort the prior epoch before another session resumes"] };
      if (contract.epoch !== run.epoch + 1) return bindInvalid({ sessionId, root, path, contract, findings: [`resume epoch must be exactly ${run.epoch + 1}`] });
      if (plan !== run.planDigest) return bindInvalid({ sessionId, root, path, contract, findings: ["resume cannot change the frozen plan"] });
      if (production.digest !== run.baselineProductionFingerprint) return bindInvalid({ sessionId, root, path, contract, findings: ["resume requires production files at the original baseline"] });
      if (run.verificationFingerprint) {
        const verification = fingerprintPaths(root, verificationPaths(contract));
        if (!verification.ok || verification.digest !== run.verificationFingerprint) return bindInvalid({ sessionId, root, path, contract, findings: ["resume requires unchanged verification assets"] });
      }
      run = {
        ...run,
        epoch: contract.epoch,
        receipts: run.receipts.filter((receipt) => receipt.phase === "before"),
        invalidReason: null,
        lease: contract.status === "open" ? { sessionId, active: true } : { sessionId: null, active: false },
      };
      kind = "resumed";
    } else if (plan !== run.planDigest) {
      if (production.digest !== run.baselineProductionFingerprint) return bindInvalid({ sessionId, root, path, contract, findings: ["revert production files to the baseline before attempting to replan"] });
      run = newRun({
        contract,
        path,
        plan,
        productionFingerprint: production.digest,
        sessionId,
        reviewMode,
        taskAnchorText: run.taskAnchor?.text ?? taskAnchorText,
      });
      kind = "replanned";
    } else {
      run.invalidReason = null;
      run.lease = contract.status === "open" ? { sessionId, active: true } : { sessionId: null, active: false };
    }
  }

  if (reviewMode === "hard") run.reviewMode = "hard";
  run.reviews ??= { oracle: null, patch: null };
  run.reviewReservation ??= null;

  if (contract.status !== "open") run.lease = { sessionId: null, active: false };
  writeRun(root, contract.id, run);
  persistBinding({ sessionId, root, path, contract });
  return { kind, repoRoot: root, path, contract, run, active: contract.status === "open" };
}

export function refreshBinding({ cwd, sessionId }) {
  const root = repoRoot(cwd);
  const session = readSession(sessionId, root);
  if (session.kind === "missing") return { kind: "idle", repoRoot: root };
  if (session.kind === "corrupt") return { kind: "invalid", repoRoot: root, findings: ["bound session state is corrupt"] };
  if (!session.value.bound) return { kind: "idle", repoRoot: root };
  const checked = loadContract(session.value.contractPath);
  if (!checked.valid) return { kind: "invalid", repoRoot: root, state: session.value, contract: checked.contract, findings: checked.findings };
  const contract = checked.contract;
  if (contract.id !== session.value.contractId || contract.epoch !== session.value.epoch) return { kind: "invalid", repoRoot: root, state: session.value, contract, findings: ["bound contract id or epoch changed without a contract mutation event"] };
  const stored = readRun(root, contract.id);
  if (stored.kind !== "ok") return { kind: "invalid", repoRoot: root, state: session.value, contract, findings: [`stored run state is ${stored.kind}`] };
  const run = stored.value;
  if (run.planDigest !== planDigest(contract)) return { kind: "invalid", repoRoot: root, state: session.value, contract, run, findings: ["contract plan changed without a contract mutation event"] };
  const production = fingerprintPaths(root, contract.scope.productionPaths);
  if (!production.ok) return { kind: "invalid", repoRoot: root, state: session.value, contract, run, findings: production.findings };
  if (contract.status === "paused" || contract.status === "aborted") return { kind: "inactive", repoRoot: root, state: session.value, contract, run, productionFingerprint: production.digest };
  if (run.verificationFingerprint) {
    const verification = fingerprintPaths(root, verificationPaths(contract));
    if (!verification.ok || verification.digest !== run.verificationFingerprint) {
      run.invalidReason = "verification assets changed after the first BEFORE receipt; restore them or abort the contract";
      run.receipts = [];
      writeRun(root, contract.id, run);
      return { kind: "invalid", repoRoot: root, state: session.value, contract, run, findings: [run.invalidReason] };
    }
    if (run.invalidReason?.startsWith("verification assets changed")) {
      run.invalidReason = null;
      writeRun(root, contract.id, run);
    }
  }
  if (run.invalidReason) return { kind: "invalid", repoRoot: root, state: session.value, contract, run, findings: [run.invalidReason] };
  const common = { repoRoot: root, state: session.value, contract, run, productionFingerprint: production.digest };
  return contract.status === "open" ? { kind: "active", ...common } : { kind: "inactive", ...common };
}

function outputMatches(output, includes) { return includes.every((literal) => String(output).includes(literal)); }

function structuredWitnesses(output, marker) {
  const prefix = `${marker} `;
  return String(output).split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .map((line) => {
      try { return JSON.parse(line.slice(prefix.length)); } catch { return null; }
    })
    .filter(Boolean);
}

function relationWitnessFinding(item, output, requireComponentMatrix) {
  const relations = item.oracle?.relations ?? [];
  for (const relation of relations) {
    const payloads = structuredWitnesses(output, relation.marker);
    if (payloads.length === 0) return `${item.id} relation witness ${relation.marker} is missing or is not valid JSON`;
    if (payloads.length !== 1) return `${item.id} relation witness ${relation.marker} must occur exactly once`;
    if (requireComponentMatrix && !payloads.some((payload) => isDeepStrictEqual(payload?.components, item.componentSamples))) return `${item.id} relation witness ${relation.marker} does not match componentSamples`;
    if (!payloads.some((payload) => isDeepStrictEqual(payload?.source, relation.sourceSample))) return `${item.id} relation witness ${relation.marker} does not match sourceSample`;
    if (!payloads.some((payload) => (!requireComponentMatrix || isDeepStrictEqual(payload?.components, item.componentSamples)) && isDeepStrictEqual(payload?.source, relation.sourceSample) && isDeepStrictEqual(payload?.target, relation.targetSample))) return `${item.id} relation witness ${relation.marker} does not match targetSample`;
  }
  return null;
}

function scenarioWitnessFinding(item, output) {
  for (const scenario of item.oracle?.scenarios ?? []) {
    const payloads = structuredWitnesses(output, scenario.marker);
    if (payloads.length === 0) return `${item.id} scenario witness ${scenario.marker} is missing or is not valid JSON`;
    if (payloads.length !== 1) return `${item.id} scenario witness ${scenario.marker} must occur exactly once`;
    if (!payloads.some((payload) => isDeepStrictEqual(payload?.contributors, scenario.contributors))) return `${item.id} scenario witness ${scenario.marker} does not match contributors`;
    const payload = payloads.find((candidate) => isDeepStrictEqual(candidate?.contributors, scenario.contributors));
    const actual = payload?.actual;
    const expected = scenario.expected;
    const diagnosticsMatch = isDeepStrictEqual(actual?.diagnostics, expected?.diagnostics);
    if (!isDeepStrictEqual(actual?.order, expected?.order) || !diagnosticsMatch) return `${item.id} scenario witness ${scenario.marker} actual ${JSON.stringify(actual)} does not match expected ${JSON.stringify(expected)}`;
  }
  return null;
}

function neutralityWitnessFinding(item, output) {
  const neutrality = item.oracle?.neutrality;
  if (!neutrality) return null;
  const payloads = structuredWitnesses(output, neutrality.marker);
  if (payloads.length === 0) return `${item.id} neutrality witness ${neutrality.marker} is missing or is not valid JSON`;
  if (payloads.length !== 1) return `${item.id} neutrality witness ${neutrality.marker} must occur exactly once`;
  const payload = payloads[0];
  if (!isDeepStrictEqual(payload?.populated, neutrality.populatedSample)) return `${item.id} neutrality witness populated input actual ${JSON.stringify(payload?.populated)} does not match expected ${JSON.stringify(neutrality.populatedSample)}`;
  if (!isDeepStrictEqual(payload?.degenerate, neutrality.degenerateSample)) return `${item.id} neutrality witness degenerate input actual ${JSON.stringify(payload?.degenerate)} does not match expected ${JSON.stringify(neutrality.degenerateSample)}`;
  for (const field of ["single", "left", "right"]) {
    if (!isDeepStrictEqual(payload?.[field], neutrality.expectedSample)) return `${item.id} neutrality witness ${field} result actual ${JSON.stringify(payload?.[field])} does not match expected ${JSON.stringify(neutrality.expectedSample)}`;
  }
  return null;
}

function coupledBoundaryWitnessFinding(item, output) {
  const coupled = item.oracle?.coupledBoundary;
  if (!coupled) return null;
  const payloads = structuredWitnesses(output, coupled.marker);
  if (payloads.length === 0) return `${item.id} coupled-boundary witness ${coupled.marker} is missing or is not valid JSON`;
  if (payloads.length !== 1) return `${item.id} coupled-boundary witness ${coupled.marker} must occur exactly once`;
  const payload = payloads[0];
  if (!isDeepStrictEqual(payload?.components, item.componentSamples)) return `${item.id} coupled-boundary witness components actual ${JSON.stringify(payload?.components)} do not match expected ${JSON.stringify(item.componentSamples)}`;
  if (!isDeepStrictEqual(payload?.actual, coupled.expectedSample)) return `${item.id} coupled-boundary witness actual ${JSON.stringify(payload?.actual)} does not match expected ${JSON.stringify(coupled.expectedSample)}`;
  return null;
}

function caseWitnessFinding(item, output, requireMatrix) {
  return relationWitnessFinding(item, output, requireMatrix)
    ?? (requireMatrix ? scenarioWitnessFinding(item, output) : null)
    ?? neutralityWitnessFinding(item, output)
    ?? coupledBoundaryWitnessFinding(item, output);
}

function hasStructuredWitnessMarker(item, output) {
  const markers = [
    ...(item.oracle?.relations ?? []).map((relation) => relation.marker),
    ...(item.oracle?.scenarios ?? []).map((scenario) => scenario.marker),
    item.oracle?.neutrality?.marker,
    item.oracle?.coupledBoundary?.marker,
  ].filter(Boolean);
  return markers.some((marker) => String(output).split(/\r?\n/u).some((line) => line.trim().startsWith(`${marker} `)));
}

export function observeCommand({ cwd, sessionId, command, outcome, output, outcomeBasis = "unspecified" }) {
  const live = refreshBinding({ cwd, sessionId });
  if (live.kind !== "active") return live;
  if (!["success", "failure", "unreported"].includes(outcome)) return { ...live, kind: "ignored", reason: `outcome ${outcome} is not evidence` };
  const normalized = normalizeCommand(command);
  const commandCwd = rel(live.repoRoot, cwd);
  const candidates = live.contract.cases.filter((item) => normalizeCommand(item.command) === normalized && item.cwd === commandCwd);
  if (candidates.length === 0) return { ...live, kind: "ignored", reason: "command is not a declared case at this cwd" };
  const beforePhase = live.productionFingerprint === live.run.baselineProductionFingerprint;
  const phase = beforePhase ? "before" : "after";
  const signatureMatched = candidates.filter((item) => (outcome === "unreported" || item[phase].outcome === outcome) && outputMatches(output, item[phase].includes));
  const relationRejections = [];
  const matched = signatureMatched.filter((item) => {
    if (phase !== "after" || !["behavioral-regression/v7", "behavioral-regression/v8", "behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(live.contract.schema)) return true;
    const requireMatrix = ["behavioral-regression/v8", "behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(live.contract.schema);
    const finding = caseWitnessFinding(item, output, requireMatrix);
    if (finding) relationRejections.push(finding);
    return !finding;
  });
  if (matched.length === 0) {
    if (phase === "after" && ["behavioral-regression/v7", "behavioral-regression/v8", "behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(live.contract.schema)) {
      const requireMatrix = ["behavioral-regression/v8", "behavioral-regression/v9", "behavioral-regression/v10", "behavioral-regression/v11"].includes(live.contract.schema);
      for (const item of candidates) {
        if (!hasStructuredWitnessMarker(item, output)) continue;
        const finding = caseWitnessFinding(item, output, requireMatrix);
        if (finding) relationRejections.push(finding);
      }
    }
    if (relationRejections.length > 0) return { ...live, kind: "rejected", reason: relationRejections.join("; ") };
    const isLateBefore = !beforePhase && candidates.some((item) => (outcome === "unreported" || item.before.outcome === outcome) && outputMatches(output, item.before.includes));
    if (isLateBefore) return { ...live, kind: "rejected", reason: "BEFORE evidence cannot be captured after a production change" };
    return { ...live, kind: "ignored", reason: `${phase.toUpperCase()} outcome or literal signature did not match` };
  }
  if (phase === "before") {
    const verification = fingerprintPaths(live.repoRoot, verificationPaths(live.contract));
    if (!verification.ok) return { ...live, kind: "rejected", reason: `BEFORE verification assets are unavailable: ${verification.findings.join("; ")}` };
    if (live.run.verificationFingerprint && verification.digest !== live.run.verificationFingerprint) return { ...live, kind: "rejected", reason: "verification assets changed during BEFORE capture" };
    live.run.verificationFingerprint = verification.digest;
  } else if (!live.run.receipts.some((receipt) => receipt.phase === "before")) {
    return { ...live, kind: "rejected", reason: "AFTER evidence cannot be recorded before any BEFORE evidence" };
  }

  const receipts = [];
  for (const item of matched) {
    live.run.sequence += 1;
    const receipt = {
      id: `BR-R${live.run.sequence}`,
      contractId: live.contract.id,
      caseId: item.id,
      epoch: live.contract.epoch,
      phase,
      planDigest: live.run.planDigest,
      commandHash: hash(normalized),
      outcome: item[phase].outcome,
      observedOutcome: outcome === "unreported" ? null : outcome,
      outcomeBasis,
      outputHash: hash(output),
      summary: String(output).replace(/\s+/gu, " ").slice(0, 240),
      productionFingerprint: live.productionFingerprint,
      verificationFingerprint: live.run.verificationFingerprint,
      at: Date.now(),
    };
    live.run.receipts.push(receipt);
    receipts.push(receipt);
  }
  live.run.receipts = live.run.receipts.slice(-200);
  writeRun(live.repoRoot, live.contract.id, live.run);
  return { ...live, kind: "recorded", receipts };
}

function receiptFinding({ item, phase, reference, live }) {
  const receipt = live.run.receipts.find((candidate) => candidate.id === reference);
  if (!receipt || receipt.contractId !== live.contract.id || receipt.caseId !== item.id || receipt.phase !== phase) return `${item.id} ${phase.toUpperCase()} receipt is missing or forged`;
  if (receipt.planDigest !== live.run.planDigest || receipt.commandHash !== hash(normalizeCommand(item.command))) return `${item.id} ${phase.toUpperCase()} receipt does not match the frozen plan`;
  if (receipt.verificationFingerprint !== live.run.verificationFingerprint) return `${item.id} ${phase.toUpperCase()} receipt has stale verification assets`;
  if (phase === "before" && receipt.productionFingerprint !== live.run.baselineProductionFingerprint) return `${item.id} BEFORE receipt was not captured at the production baseline`;
  if (phase === "after" && receipt.productionFingerprint !== live.productionFingerprint) return `${item.id} has a stale AFTER receipt after a later production edit`;
  return null;
}

export function independentReviewDimensions(contract) {
  const dimensions = [];
  const semantics = new Set(contract?.surface?.semantics ?? []);
  if (semantics.has("ordering")) dimensions.push("ordering");
  if (semantics.has("concurrency")) dimensions.push("concurrency");
  if (contract?.surface?.compositionDepth === "three-or-more") dimensions.push("composition");
  if (contract?.surface?.inputShape === "multi-component") dimensions.push("multi-component");
  if (contract?.surface?.inputShape === "variadic" && semantics.has("representation")) dimensions.push("representation");
  return [...new Set(dimensions)];
}

export function requiresIndependentReview(contract) { return independentReviewDimensions(contract).length > 0; }

function independentReviewChallengePack(contract) {
  const dimensions = new Set(independentReviewDimensions(contract));
  const challenges = [];
  const neutrality = contract?.cases?.find((item) => item?.oracle?.neutrality)?.oracle?.neutrality;
  const coupled = contract?.cases?.find((item) => item?.oracle?.coupledBoundary)?.oracle?.coupledBoundary;
  if (dimensions.has("ordering")) challenges.push(
    { id: "ordering.independent-pair", input: [[1, 2], [3, 4]], expected: [1, 3, 2, 4], alternative: [1, 2, 3, 4], oraclePolicy: "stable-topological-layers", contrastPolicy: "eager-first-seen" },
    { id: "ordering.independent-chains", input: [[1, 2, 7], [3, 4], [5, 6]], expected: [1, 3, 5, 2, 4, 6, 7], alternative: [1, 2, 7, 3, 4, 5, 6], oraclePolicy: "stable-topological-layers", contrastPolicy: "eager-first-seen" },
  );
  for (const [index, supersession] of (contract?.scope?.supersededAssertions ?? []).entries()) {
    try {
      challenges.push({
        id: `supersession.${index + 1}`,
        input: supersession.inputLiterals.map((literal) => JSON.parse(literal)),
        expected: JSON.parse(supersession.afterExpectedLiteral),
        alternative: JSON.parse(supersession.beforeExpectedLiteral),
        oraclePolicy: contract.surface?.orderingPolicy ?? "task-derived",
        contrastPolicy: "git-baseline-assertion",
      });
    } catch { /* Contract validation reports malformed supersession literals before review. */ }
  }
  if ((dimensions.has("representation") || dimensions.has("multi-component"))
    && contract?.surface?.interactionModel === "coupled-boundary" && coupled) {
    const coupledCase = contract.cases.find((item) => item?.oracle?.coupledBoundary === coupled);
    challenges.push({
      id: "representation.coupled-boundary",
      input: coupledCase.componentSamples,
      expected: coupled.expectedSample,
      alternative: coupled.rejectedAlternative,
      oraclePolicy: "coupled-boundary",
      contrastPolicy: "independent-component-or-error-shortcut",
    });
  } else if (dimensions.has("representation") && contract?.surface?.interactionModel === "homogeneous-neutrality" && neutrality) {
    challenges.push({
      id: "representation.homogeneous-neutrality",
      input: { populated: neutrality.populatedSample, degenerate: neutrality.degenerateSample },
      expected: { single: neutrality.expectedSample, left: neutrality.expectedSample, right: neutrality.expectedSample },
      alternative: { single: neutrality.expectedSample, left: neutrality.degenerateSample, right: neutrality.degenerateSample },
      oraclePolicy: "homogeneous-neutrality",
      contrastPolicy: "aggregate-empty-shortcut",
    });
  } else if (dimensions.has("representation")) challenges.push(
    { id: "representation.partial-left", instruction: "degenerate slot-0 and keep slot-1 populated; verify the populated output value, representation, and shape from that same invocation" },
    { id: "representation.partial-right", instruction: "keep slot-0 populated and degenerate slot-1; verify the populated output value, representation, and shape from that same invocation" },
    { id: "representation.zero-dimension-shape", instruction: "exercise an empty value with a non-trivial remaining dimension and verify rank and shape, not only size" },
  );
  if (dimensions.has("composition") && contract?.surface?.orderingPolicy === "stable-topological-layers") {
    challenges.push({
      id: "composition.direct-many",
      input: [[1, 2], [2, 3], [4]],
      expected: [1, 4, 2, 3],
      alternative: [1, 2, 3, 4],
      oraclePolicy: "stable-topological-layers",
      contrastPolicy: "eager-first-seen",
    });
  } else if (dimensions.has("composition") && contract?.surface?.interactionModel === "homogeneous-neutrality" && neutrality) {
    challenges.push({
      id: "composition.direct-many",
      input: { contributors: [neutrality.degenerateSample, neutrality.populatedSample, neutrality.degenerateSample] },
      expected: neutrality.expectedSample,
      alternative: neutrality.degenerateSample,
      oraclePolicy: "homogeneous-neutrality",
      contrastPolicy: "aggregate-empty-shortcut",
    });
  } else if (dimensions.has("composition")) challenges.push({ id: "composition.direct-many", instruction: "exercise at least three contributors through the existing constraint seam in one call" });
  if (dimensions.has("multi-component") && contract?.surface?.interactionModel !== "coupled-boundary") challenges.push({ id: "multi-component.asymmetric", instruction: "degenerate each component separately and trace every preserved peer to the same invocation result" });
  if (dimensions.has("concurrency")) challenges.push({ id: "concurrency.interleaving", instruction: "derive one concrete interleaving that distinguishes the claimed policy from a plausible eager or stale-state shortcut" });
  return challenges;
}

function independentReviewChallengeDigest(contract) {
  return hash(JSON.stringify({ protocolVersion: 5, challengePack: independentReviewChallengePack(contract) }));
}

export function independentReviewChallengeIds(contract) {
  return independentReviewChallengePack(contract).map((challenge) => challenge.id);
}

export function independentReviewChallengeDrafts(contract, stage, evidenceAnchor) {
  return independentReviewChallengePack(contract).map((challenge) => {
    const machineCheckable = challenge.input !== undefined;
    return {
      id: challenge.id,
      input: challenge.input ?? CHALLENGE_INPUT_PROMPT,
      derivedExpected: machineCheckable ? null : CHALLENGE_EXPECTED_PROMPT,
      rejectedAlternative: machineCheckable ? null : CHALLENGE_ALTERNATIVE_PROMPT,
      valueMode: machineCheckable ? "raw-json" : "qualitative-string-12..1000",
      ...(machineCheckable ? {
        valueShape: rawJsonValueShape(challenge.expected),
        contrastValueShape: rawJsonValueShape(challenge.alternative),
      } : {}),
      ...(machineCheckable && typeof challenge.expected?.representation === "string" ? { representationGrammar: REPRESENTATION_GRAMMAR } : {}),
      ...(stage === "patch" && machineCheckable ? {
        observedActual: null,
        observedValueShape: rawJsonValueShape(challenge.expected),
      } : {}),
      ...(machineCheckable ? { oraclePolicy: challenge.oraclePolicy, contrastPolicy: challenge.contrastPolicy } : {}),
      disposition: stage === "oracle" ? "contract-conforms|contract-conflicts" : "implementation-conforms|implementation-conflicts",
      evidenceAnchor,
    };
  });
}

function phaseEvidenceFindings(live, phase) {
  const findings = [];
  if (!live.run.verificationFingerprint) findings.push("no BEFORE evidence froze the verification assets");
  for (const item of live.contract.cases) {
    const finding = receiptFinding({ item, phase, reference: item.receipts[phase], live });
    if (finding) findings.push(finding);
  }
  return [...new Set(findings)];
}

function reviewReceiptFinding(live, stage) {
  const receipt = live.run.reviews?.[stage];
  if (!receipt || receipt.decision !== "approve") return `${stage} independent review approval is missing`;
  if (receipt.challengeDigest !== independentReviewChallengeDigest(live.contract)) return `${stage} independent review is stale after the challenge protocol changed`;
  if (receipt.planDigest !== live.run.planDigest || receipt.verificationFingerprint !== live.run.verificationFingerprint) return `${stage} independent review is stale after plan or verification changes`;
  const expectedProduction = stage === "oracle" ? live.run.baselineProductionFingerprint : live.productionFingerprint;
  if (receipt.productionFingerprint !== expectedProduction) return `${stage} independent review is stale after a production change`;
  return null;
}

export function reserveIndependentReview({ cwd, sessionId, contractId, stage, toolUseId }) {
  const live = refreshBinding({ cwd, sessionId });
  if (live.kind !== "active" || live.run.reviewMode !== "hard" || !requiresIndependentReview(live.contract)) return { ...live, kind: "ignored" };
  if (contractId !== live.contract.id || !["oracle", "patch"].includes(stage)) return { ...live, kind: "rejected", reason: "review request does not match the active contract and stage" };
  const currentReview = live.run.reviews?.[stage];
  if (currentReview && !reviewReceiptFinding(live, stage)) {
    return { ...live, kind: "rejected", reason: `current ${stage} approval ${currentReview.id} already matches the frozen plan and evidence; reuse it instead of dispatching another reviewer` };
  }
  const readiness = stage === "oracle"
    ? (live.productionFingerprint === live.run.baselineProductionFingerprint ? phaseEvidenceFindings(live, "before") : ["oracle review must precede production changes"])
    : (live.productionFingerprint === live.run.baselineProductionFingerprint ? ["patch review requires a production change"] : phaseEvidenceFindings(live, "after"));
  if (readiness.length > 0) return { ...live, kind: "rejected", reason: readiness.join("; ") };
  live.run.reviewReservation = {
    contractId,
    stage,
    nonce: randomBytes(12).toString("hex"),
    toolUseId: toolUseId || null,
    agentId: null,
    state: "reserved",
    planDigest: live.run.planDigest,
    productionFingerprint: live.productionFingerprint,
    verificationFingerprint: live.run.verificationFingerprint,
    challengeDigest: independentReviewChallengeDigest(live.contract),
    observedEvidenceAnchors: [],
    at: Date.now(),
  };
  writeRun(live.repoRoot, live.contract.id, live.run);
  return { ...live, kind: "reserved", reservation: live.run.reviewReservation };
}

export function bindIndependentReviewer({ cwd, sessionId, contractId, stage, agentId }) {
  const live = refreshBinding({ cwd, sessionId });
  const reservation = live.run?.reviewReservation;
  if (live.kind !== "active" || !reservation || reservation.state !== "reserved" || reservation.contractId !== contractId || reservation.stage !== stage || !agentId) {
    return { ...live, kind: "rejected", reason: "no matching reserved independent review" };
  }
  reservation.state = "bound";
  reservation.agentId = agentId;
  reservation.boundAt = Date.now();
  writeRun(live.repoRoot, live.contract.id, live.run);
  return {
    ...live,
    kind: "bound-reviewer",
    reservation,
    projection: {
      contractId: live.contract.id,
      stage,
      problem: live.contract.problem,
      taskAnchor: live.run.taskAnchor,
      surface: live.contract.surface,
      candidateCases: live.contract.cases.map((item) => ({
        id: item.id,
        role: item.role,
        dimension: item.dimension,
        coverage: item.coverage,
        ...(stage === "patch" ? { oracle: item.oracle } : {}),
        protectedPaths: item.protectedPaths ?? [],
      })),
      challengePack: independentReviewChallengePack(live.contract).map((challenge) => stage === "oracle"
        ? Object.fromEntries(Object.entries(challenge).filter(([key]) => !["expected", "alternative"].includes(key)))
        : challenge),
      evidencePaths: [...live.contract.scope.productionPaths, ...(live.contract.scope.regressionPaths ?? [])],
      dimensions: independentReviewDimensions(live.contract),
    },
  };
}

export function independentReviewerBinding({ cwd, sessionId, agentId }) {
  const live = refreshBinding({ cwd, sessionId });
  const reservation = live.run?.reviewReservation;
  return live.kind === "active" && reservation?.state === "bound" && reservation.agentId === agentId
    ? { ...live, kind: "reviewer", reservation }
    : { ...live, kind: "ignored" };
}

export function observeIndependentReviewerAnchor({ cwd, sessionId, agentId, path }) {
  const live = refreshBinding({ cwd, sessionId });
  const reservation = live.run?.reviewReservation;
  if (live.kind !== "active" || reservation?.state !== "bound" || reservation.agentId !== agentId) return { ...live, kind: "ignored" };
  if (typeof path !== "string" || !path.trim()) return { ...live, kind: "rejected", reason: "reviewer Read/Grep must name one exact evidencePaths entry" };
  const anchor = rel(live.repoRoot, path);
  const required = [...live.contract.scope.productionPaths, ...(live.contract.scope.regressionPaths ?? [])];
  if (!required.includes(anchor)) return { ...live, kind: "rejected", reason: `reviewers may inspect only exact evidencePaths entries; ${anchor} is outside the declared anchors` };
  reservation.observedEvidenceAnchors ??= [];
  if (!reservation.observedEvidenceAnchors.includes(anchor)) reservation.observedEvidenceAnchors.push(anchor);
  writeRun(live.repoRoot, live.contract.id, live.run);
  return { ...live, kind: "recorded-review-anchor", anchor };
}

function reviewChallengeFinding(contract, result, stage, requiredAnchors) {
  const expectedChallenges = independentReviewChallengePack(contract);
  if (!Array.isArray(result.challengeResults)) return "review challengeResults must contain one independently derived result for every checked challenge";
  if (result.challengeResults.length !== expectedChallenges.length) return `review challengeResults must contain exactly ${expectedChallenges.length} entries`;
  const allowedDisposition = stage === "oracle"
    ? ["contract-conforms", "contract-conflicts"]
    : ["implementation-conforms", "implementation-conflicts"];
  let conflicts = 0;
  for (const challenge of expectedChallenges) {
    const matches = result.challengeResults.filter((item) => item?.id === challenge.id);
    if (matches.length !== 1) return `review challengeResults must contain ${challenge.id} exactly once`;
    const item = matches[0];
    const oracleValueShape = rawJsonValueShape(challenge.expected);
    const contrastValueShape = rawJsonValueShape(challenge.alternative);
    if (!allowedDisposition.includes(item.disposition)) return `review challengeResults ${challenge.id} disposition must be one of: ${allowedDisposition.join(", ")}`;
    if (item.disposition.endsWith("conflicts")) conflicts += 1;
    if (!requiredAnchors.includes(item.evidenceAnchor)) return `review challengeResults ${challenge.id} evidenceAnchor must name one exact evidencePaths entry`;
    if (Object.hasOwn(challenge, "input")) {
      if (!isDeepStrictEqual(item.input, challenge.input)) return `review challengeResults ${challenge.id} input must equal the frozen challenge input`;
      if (stage === "patch") {
        if (!Object.hasOwn(item, "observedActual")) return `review challengeResults ${challenge.id} patch result must include observedActual as the native JSON outcome inferred from the current implementation`;
        const implementationConforms = item.disposition === "implementation-conforms";
        if (implementationConforms !== isDeepStrictEqual(item.observedActual, challenge.expected)) {
          return `review challengeResults ${challenge.id} disposition must match whether observedActual equals the frozen oracle`;
        }
      }
      const oracleConflict = stage === "oracle" && item.disposition === "contract-conflicts";
      if (oracleConflict) {
        if (isDeepStrictEqual(item.derivedExpected, challenge.expected)) {
          return `review challengeResults ${challenge.id} derivedExpected matches the contract oracle; use disposition contract-conforms. Oracle-stage disposition compares the independent derivation with the contract oracle, never with the known baseline implementation`;
        }
        if (!hasAdvertisedJsonShape(item.derivedExpected, challenge.expected)) {
          return `review challengeResults ${challenge.id} contract-conflicts derivedExpected must be a different raw JSON value matching valueShape ${oracleValueShape}, with no prose`;
        }
        if (!hasAdvertisedJsonShape(item.rejectedAlternative, challenge.expected)) {
          return `review challengeResults ${challenge.id} contract-conflicts rejectedAlternative must be a raw JSON value matching valueShape ${oracleValueShape}, with no prose`;
        }
        if (typeof challenge.expected?.representation === "string"
          && (!hasCanonicalRepresentationValue(item.derivedExpected) || !hasCanonicalRepresentationValue(item.rejectedAlternative))) {
          return `review challengeResults ${challenge.id} representationGrammar requires every descriptor to match the JSON value nesting and lengths`;
        }
      } else {
        if (!isDeepStrictEqual(item.derivedExpected, challenge.expected)) {
          if (stage === "oracle") return `review challengeResults ${challenge.id} derivedExpected does not equal the frozen contract oracle. It must remain a raw JSON value matching valueShape ${oracleValueShape}, with no prose. If this is your unchanged independent derivation, keep derivedExpected, switch disposition to contract-conflicts, provide a same-valueShape distinct rejectedAlternative, and use decision challenge; do not guess or echo the hidden oracle`;
          return `review challengeResults ${challenge.id} derivedExpected must be the raw JSON value matching valueShape ${oracleValueShape} for the independently checked oracle, with no prose`;
        }
        const authorSelectedCoupledContrast = challenge.id === "representation.coupled-boundary"
          && challenge.contrastPolicy === "independent-component-or-error-shortcut";
        if (authorSelectedCoupledContrast) {
          if (!hasAdvertisedJsonShape(item.rejectedAlternative, challenge.alternative)
            || !hasCanonicalRepresentationValue(item.rejectedAlternative)) {
            return `review challengeResults ${challenge.id} rejectedAlternative must be an independently derived raw JSON contrast matching valueShape ${contrastValueShape}; representationGrammar requires its descriptor to match the JSON value nesting and lengths, while the exact author-selected contrast label is not required`;
          }
        } else if (!isDeepStrictEqual(item.rejectedAlternative, challenge.alternative)) return `review challengeResults ${challenge.id} rejectedAlternative must be the raw JSON value matching valueShape ${contrastValueShape} for the independently checked contrast policy, with no prose`;
      }
      if (isDeepStrictEqual(item.derivedExpected, item.rejectedAlternative)) return `review challengeResults ${challenge.id} must distinguish the oracle from its rejected alternative`;
    } else if (!(typeof item.input === "string" && item.input.trim().length >= 12 && item.input.length <= 1000
      && item.input.trim() !== CHALLENGE_INPUT_PROMPT
      && typeof item.derivedExpected === "string" && item.derivedExpected.trim().length >= 12 && item.derivedExpected.length <= 1000
      && item.derivedExpected.trim() !== CHALLENGE_EXPECTED_PROMPT
      && typeof item.rejectedAlternative === "string" && item.rejectedAlternative.trim().length >= 12 && item.rejectedAlternative.length <= 1000
      && item.rejectedAlternative.trim() !== CHALLENGE_ALTERNATIVE_PROMPT
      && item.derivedExpected.trim() !== item.rejectedAlternative.trim())) {
      return `review challengeResults ${challenge.id} uses valueMode qualitative-string-12..1000: input, derivedExpected, and rejectedAlternative must each be a descriptive JSON string of 12..1000 characters (not an array or object); provide a distinct rejectedAlternative to distinguish it from derivedExpected`;
    }
  }
  if (result.decision === "approve" && conflicts > 0) return "review decision approve conflicts with a challenge disposition";
  if (result.decision === "challenge" && conflicts === 0) return "review decision challenge requires at least one conflicting challenge disposition";
  return null;
}

export function observeIndependentReview({ cwd, sessionId, agentId, result }) {
  const live = refreshBinding({ cwd, sessionId });
  const reservation = live.run?.reviewReservation;
  if (live.kind !== "active" || !reservation || !["reserved", "bound"].includes(reservation.state) || !agentId) return { ...live, kind: "ignored" };
  if (reservation.state === "bound" && reservation.agentId !== agentId) return { ...live, kind: "rejected", reason: "review result came from a different subagent" };
  if (reservation.state === "reserved") {
    reservation.state = "bound";
    reservation.agentId = agentId;
    reservation.boundAt = Date.now();
  }
  if (!result || result.contractId !== live.contract.id || result.stage !== reservation.stage || result.reviewNonce !== reservation.nonce) return { ...live, kind: "rejected", reason: "review result does not match its lifecycle reservation" };
  if (reservation.challengeDigest !== independentReviewChallengeDigest(live.contract)) return { ...live, kind: "rejected", reason: "review challenge protocol changed after reservation; dispatch a fresh reviewer" };
  if (! ["approve", "challenge"].includes(result.decision)) return { ...live, kind: "rejected", reason: "review decision must be approve or challenge" };
  const requiredDimensions = independentReviewDimensions(live.contract);
  if (!Array.isArray(result.checkedDimensions) || requiredDimensions.some((dimension) => !result.checkedDimensions.includes(dimension))) return { ...live, kind: "rejected", reason: `review must independently check: ${requiredDimensions.join(", ")}` };
  const requiredChallenges = independentReviewChallengeIds(live.contract);
  if (!Array.isArray(result.checkedChallenges) || requiredChallenges.some((challenge) => !result.checkedChallenges.includes(challenge))
    || result.checkedChallenges.some((challenge) => !requiredChallenges.includes(challenge))) {
    return { ...live, kind: "rejected", reason: `review checkedChallenges must cover exactly: ${requiredChallenges.join(", ")}` };
  }
  if (!Array.isArray(result.counterexamples) || result.counterexamples.length === 0) return { ...live, kind: "rejected", reason: "review counterexamples must contain at least one concrete falsification attempt of 12..1000 characters" };
  for (const [index, value] of result.counterexamples.entries()) {
    if (typeof value !== "string") return { ...live, kind: "rejected", reason: `review counterexamples[${index}] must be a string` };
    if (value.trim().length < 12) return { ...live, kind: "rejected", reason: `review counterexamples[${index}] has ${value.trim().length} significant characters; minimum is 12` };
    if (value.length > 1000) return { ...live, kind: "rejected", reason: `review counterexamples[${index}] has ${value.length} characters; maximum is 1000` };
  }
  const requiredAnchors = [...live.contract.scope.productionPaths, ...(live.contract.scope.regressionPaths ?? [])];
  const unreadAnchors = requiredAnchors.filter((anchor) => !(reservation.observedEvidenceAnchors ?? []).includes(anchor));
  if (unreadAnchors.length > 0) return { ...live, kind: "rejected", reason: `reviewer must read each exact evidencePaths entry before approval: ${unreadAnchors.join(", ")}` };
  if (!Array.isArray(result.evidenceAnchors)
    || requiredAnchors.some((anchor) => !result.evidenceAnchors.includes(anchor))
    || result.evidenceAnchors.some((anchor) => !requiredAnchors.includes(anchor))) {
    return { ...live, kind: "rejected", reason: `review evidenceAnchors must cover exactly: ${requiredAnchors.join(", ")}` };
  }
  const challengeFinding = reviewChallengeFinding(live.contract, result, reservation.stage, requiredAnchors);
  if (challengeFinding) return { ...live, kind: "rejected", reason: challengeFinding };
  if (reservation.planDigest !== live.run.planDigest || reservation.productionFingerprint !== live.productionFingerprint || reservation.verificationFingerprint !== live.run.verificationFingerprint) return { ...live, kind: "rejected", reason: "review reservation became stale" };
  if (reservation.stage === "patch" && live.run.reviews?.oracle?.agentId === agentId) return { ...live, kind: "rejected", reason: "patch reviewer must be independent from the oracle reviewer" };
  live.run.sequence += 1;
  const receipt = {
    id: `BR-V${live.run.sequence}`,
    stage: reservation.stage,
    agentId,
    decision: result.decision,
    planDigest: live.run.planDigest,
    productionFingerprint: live.productionFingerprint,
    verificationFingerprint: live.run.verificationFingerprint,
    challengeDigest: reservation.challengeDigest,
    resultHash: hash(JSON.stringify(result)),
    at: Date.now(),
  };
  live.run.reviews[reservation.stage] = receipt;
  live.run.reviewReservation = null;
  writeRun(live.repoRoot, live.contract.id, live.run);
  return { ...live, kind: "review-recorded", receipt };
}

export function beforeEvidenceFindings(live) {
  if (live.kind !== "active") return live.kind === "invalid" ? (live.findings ?? ["bound behavioral regression state is invalid"]) : [];
  const findings = phaseEvidenceFindings(live, "before");
  if (live.run.reviewMode === "hard" && requiresIndependentReview(live.contract)) {
    const review = reviewReceiptFinding(live, "oracle");
    if (review) findings.push(`${review}; dispatch a read-only subagent with BR_REVIEW_REQUEST ${live.contract.id} oracle`);
  }
  return [...new Set(findings)];
}

export function completionFindings(live) {
  if (live.kind === "idle") return [];
  if (live.kind === "invalid") return live.findings ?? ["bound behavioral regression state is invalid"];
  if (live.contract.status === "paused" || live.contract.status === "aborted") {
    return live.productionFingerprint === live.run.baselineProductionFingerprint
      ? []
      : ["cannot pause or abort after production changed; finish the evidence loop or restore the production baseline first"];
  }
  const findings = [];
  if (live.contract.status !== "closed") {
    findings.push(live.productionFingerprint === live.run.baselineProductionFingerprint
      ? "contract remains open; close, pause, or abort it before Stop"
      : "contract remains open; satisfy the frozen AFTER evidence and close it, or restore the production baseline before replanning");
  }
  if (!live.run.verificationFingerprint) findings.push("no BEFORE evidence froze the verification assets");
  if (live.productionFingerprint === live.run.baselineProductionFingerprint) findings.push("production behavior has no observed implementation change");
  for (const item of live.contract.cases) {
    for (const phase of ["before", "after"]) {
      const finding = receiptFinding({ item, phase, reference: item.receipts[phase], live });
      if (finding) findings.push(finding);
    }
  }
  if (live.run.reviewMode === "hard" && requiresIndependentReview(live.contract)) {
    const review = reviewReceiptFinding(live, "patch");
    if (review) findings.push(`${review}; after fresh AFTER evidence dispatch a different read-only subagent with BR_REVIEW_REQUEST ${live.contract.id} patch`);
  }
  return [...new Set(findings)];
}

export function discoverContracts(cwd) {
  const root = repoRoot(cwd);
  try {
    const output = execFileSync("find", [resolve(root, ".behavioral-regression"), "-maxdepth", "1", "-type", "f", "-name", "BR-*.json", "-print"], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    return output.trim().split("\n").filter(Boolean).slice(0, 20).map((path) => ({ path, checked: loadContract(path) }));
  } catch { return []; }
}
