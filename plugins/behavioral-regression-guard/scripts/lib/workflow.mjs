import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";

import { isContractPath, loadContract, normalizeCommand, planDigest } from "./contract.mjs";
import { fingerprintPaths } from "./fingerprint.mjs";
import { newRun, readRun, readSession, writeRun, writeSession } from "./state-store.mjs";

function repoRoot(cwd) {
  try { return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return resolve(cwd); }
}

function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function rel(root, path) { return relative(root, resolve(path)).replaceAll("\\", "/") || "."; }

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

export function bindContractAfterMutation({ cwd, sessionId, touchedPaths }) {
  const root = repoRoot(cwd);
  const candidates = [...new Set(touchedPaths.map((path) => resolve(path)))].filter((path) => isContractPath(path, root));
  if (candidates.length === 0) return { kind: "idle" };
  if (candidates.length > 1) return { kind: "invalid", findings: ["one hook event cannot bind multiple behavioral regression contracts"] };
  const path = candidates[0];
  const checked = loadContract(path);
  if (!checked.valid) return bindInvalid({ sessionId, root, path, findings: checked.findings });
  const contract = checked.contract;
  const production = fingerprintPaths(root, contract.scope.productionPaths);
  if (!production.ok) return bindInvalid({ sessionId, root, path, contract, findings: production.findings });
  const plan = planDigest(contract);
  const stored = readRun(root, contract.id);
  let run;
  let kind = "bound";

  if (stored.kind === "corrupt") return bindInvalid({ sessionId, root, path, contract, findings: ["stored run state is corrupt"] });
  if (stored.kind === "missing") {
    run = newRun({ contract, path, plan, productionFingerprint: production.digest, sessionId });
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
        const verification = fingerprintPaths(root, contract.scope.verificationPaths);
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
      run = newRun({ contract, path, plan, productionFingerprint: production.digest, sessionId });
      kind = "replanned";
    } else {
      run.invalidReason = null;
      run.lease = contract.status === "open" ? { sessionId, active: true } : { sessionId: null, active: false };
    }
  }

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
  if (!checked.valid) return { kind: "invalid", repoRoot: root, state: session.value, findings: checked.findings };
  const contract = checked.contract;
  if (contract.id !== session.value.contractId || contract.epoch !== session.value.epoch) return { kind: "invalid", repoRoot: root, state: session.value, contract, findings: ["bound contract id or epoch changed without a contract mutation event"] };
  const stored = readRun(root, contract.id);
  if (stored.kind !== "ok") return { kind: "invalid", repoRoot: root, state: session.value, contract, findings: [`stored run state is ${stored.kind}`] };
  const run = stored.value;
  if (run.planDigest !== planDigest(contract)) return { kind: "invalid", repoRoot: root, state: session.value, contract, run, findings: ["contract plan changed without a contract mutation event"] };
  if (contract.status === "paused" || contract.status === "aborted") return { kind: "inactive", repoRoot: root, state: session.value, contract, run, productionFingerprint: null };
  const production = fingerprintPaths(root, contract.scope.productionPaths);
  if (!production.ok) return { kind: "invalid", repoRoot: root, state: session.value, contract, run, findings: production.findings };
  if (run.verificationFingerprint) {
    const verification = fingerprintPaths(root, contract.scope.verificationPaths);
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
  const matched = candidates.filter((item) => (outcome === "unreported" || item[phase].outcome === outcome) && outputMatches(output, item[phase].includes));
  if (matched.length === 0) {
    const isLateBefore = !beforePhase && candidates.some((item) => (outcome === "unreported" || item.before.outcome === outcome) && outputMatches(output, item.before.includes));
    if (isLateBefore) return { ...live, kind: "rejected", reason: "BEFORE evidence cannot be captured after a production change" };
    return { ...live, kind: "ignored", reason: `${phase.toUpperCase()} outcome or literal signature did not match` };
  }
  if (phase === "before") {
    const verification = fingerprintPaths(live.repoRoot, live.contract.scope.verificationPaths);
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

export function completionFindings(live) {
  if (live.kind === "idle") return [];
  if (live.kind === "invalid") return live.findings ?? ["bound behavioral regression state is invalid"];
  if (live.contract.status === "paused" || live.contract.status === "aborted") return [];
  const findings = [];
  if (live.contract.status !== "closed") findings.push("contract remains open; close, pause, or abort it before Stop");
  if (!live.run.verificationFingerprint) findings.push("no BEFORE evidence froze the verification assets");
  if (live.productionFingerprint === live.run.baselineProductionFingerprint) findings.push("production behavior has no observed implementation change");
  for (const item of live.contract.cases) {
    for (const phase of ["before", "after"]) {
      const finding = receiptFinding({ item, phase, reference: item.receipts[phase], live });
      if (finding) findings.push(finding);
    }
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
