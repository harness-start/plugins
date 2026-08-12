import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { clearProbe, readProbe, writeProbe } from "./state-store.mjs";

const PROBE_TTL_MS = 2 * 60 * 60 * 1000;
const RUNNER_PATTERN = /(?:^|[\s/])(?:pytest|py\.test|unittest|runtests?(?:\.py)?|jest|vitest|mocha|rspec)(?:[\s:]|$)|\b(?:cargo|go)\s+test\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b/iu;
const PROBE_WORD_PATTERN = /(?:^|[\s/_.-])(?:test|tests|spec|specs|repro|reproduction|regression|assert|check)(?:[\s/_.:-]|$)/iu;
const AD_HOC_RUNTIME_PATTERN = /(?:^|\s)(?:python[0-9.]*|node|ruby|php)(?:\s|$)/iu;
const BEHAVIORAL_WARNING_PATTERN = /(?:^|\n)\s*WARNING:\s*[^\n]{0,200}\b(?:opposite\s+order|order\s+conflict|conflicting\s+order|incorrect\s+order|unexpected\s+order)\b/iu;
const CAPTURED_BEHAVIORAL_WARNING_PATTERN = /\bwarnings?\s*:\s*\[\s*['"][^'"\]\n]{0,500}\b(?:opposite\s+order|order\s+conflict|conflicting\s+order|incorrect\s+order|unexpected\s+order)\b[^'"\]\n]*['"]/iu;
const TYPED_BEHAVIORAL_WARNING_PATTERN = /\b[A-Za-z0-9_]*(?:Conflict|Order|Behavior)[A-Za-z0-9_]*Warning\b[^\n]{0,500}\b(?:opposite\s+order|order\s+conflict|conflicting\s+order|incorrect\s+order|unexpected\s+order)\b/iu;
const STRONG_FAILURE_PATTERN = /\b(?:FAIL(?:ED|URE)?|AssertionError|Traceback|mismatch|unexpected|broken|regression)\b|(?:^|_)REPRO(?:DUCTION)?\b|\b[A-Z][A-Za-z0-9_]*Error\b/iu;
const EXPLICIT_BEHAVIOR_FAILURE_PATTERN = /\b(?:FAIL(?:ED|URE)?|AssertionError|mismatch|unexpected|broken|regression)\b|(?:^|_)REPRO(?:DUCTION)?\b/iu;
const FRAMEWORK_SETUP_FAILURE_PATTERN = /\bImproperlyConfigured\b[^\n]*(?:settings?|configuration)\b|\bsettings? (?:are|is) not configured\b/iu;
const PROOF_DIRECTORY_PATTERN = /(?:^|\/)(?:test|tests|testing|spec|specs|__tests__|fixtures?)(?:\/|$)/iu;
const PROOF_FILE_PATTERN = /(?:^|\/)(?:test_[^/]+|[^/]+_(?:test|spec)|[^/]+\.(?:test|spec))\.[^/]+$/iu;
const MANAGED_PROOF_PATH_PATTERN = /^\.behavioral-regression\/BR-[A-Za-z0-9][A-Za-z0-9-]{2,80}\/.+/u;
const DIRECT_PROOF_RUNNER_PATTERN = /^(?:python(?:[0-9]+(?:\.[0-9]+)*)?|node|ruby|php|perl|bash|sh|deno)$/u;
const GENERATED_STATE_PATTERN = /^\.(?:command-exec-audit|file-access-audit|subagent-lifecycle-audit)(?:\/|$)/u;
const PYTHON_CACHE_FILE_PATTERN = /(?:^|\/)__pycache__\/[^/]+\.py[co]$/u;

function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }

function directCommandWords(command) {
  const words = [];
  let word = "";
  let quote = null;
  let escaped = false;
  const source = String(command ?? "").trim();
  if (!source || /[\r\n]/u.test(source)) return null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      word += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else word += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (word) words.push(word);
      word = "";
      continue;
    }
    if (";&|<>`".includes(character) || (character === "$" && source[index + 1] === "(")) return null;
    word += character;
  }
  if (quote || escaped) return null;
  if (word) words.push(word);
  return words;
}

export function isManagedProofCommand(command, cwd, repoRoot) {
  const words = directCommandWords(command);
  if (!words?.length) return false;
  let executableIndex = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[executableIndex] ?? "")) {
    return false;
  }
  const executable = words[executableIndex];
  if (!executable) return false;
  const root = resolve(repoRoot);
  const managedPaths = words.slice(executableIndex).map((word, offset) => {
    const path = resolve(cwd, word.replace(/^\.\//u, ""));
    const rel = relative(root, path).replaceAll("\\", "/");
    try {
      const real = realpathSync(path);
      const realRel = relative(root, real).replaceAll("\\", "/");
      return MANAGED_PROOF_PATH_PATTERN.test(rel)
        && MANAGED_PROOF_PATH_PATTERN.test(realRel)
        && existsSync(path)
        && lstatSync(path).isFile()
        ? { index: executableIndex + offset, path }
        : null;
    } catch { return null; }
  }).filter(Boolean);
  if (managedPaths.length === 0) return false;
  const executablePath = resolve(cwd, executable.replace(/^\.\//u, ""));
  const executableRel = relative(root, executablePath).replaceAll("\\", "/");
  if (MANAGED_PROOF_PATH_PATTERN.test(executableRel)) return managedPaths.some((item) => item.index === executableIndex);
  if (!DIRECT_PROOF_RUNNER_PATTERN.test(executable)) return false;
  const proofIndex = managedPaths[0].index;
  const options = words.slice(executableIndex + 1, proofIndex);
  if (/^python/u.test(executable)) return options.every((word) => /^(?:-B|-E|-I|-O|-OO|-P|-q|-s|-S|-u|-v|-W.+)$/u.test(word));
  if (executable === "node") return options.every((word) => word === "--test");
  if (executable === "deno") return options.length === 1 && ["run", "test"].includes(options[0]);
  return options.length === 0;
}

export function managedProofCommandAssets(command, cwd, repoRoot) {
  if (!isManagedProofCommand(command, cwd, repoRoot)) return [];
  const root = resolve(repoRoot);
  return [...new Set((directCommandWords(command) ?? []).flatMap((word) => {
    const path = resolve(cwd, word.replace(/^\.\//u, ""));
    if (!existsSync(path) || !isManagedProofAsset(path, root)) return [];
    try {
      if (!lstatSync(path).isFile()) return [];
      return targetRelativePaths(path, root);
    } catch { return []; }
  }))];
}

export function managedProofDirectRecovery(command, cwd, repoRoot) {
  const wrapper = String(command ?? "").trim().match(/^(?<direct>[^;\r\n]+);\s*echo\s+(?:["'][^"']*["']|[^\r\n]*)$/u);
  const direct = wrapper?.groups?.direct?.trim();
  return direct && isManagedProofCommand(direct, cwd, repoRoot) ? direct : null;
}

function workspaceFileDigest(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return `symlink:${readlinkSync(path)}`;
    if (!stat.isFile()) return `other:${stat.mode}`;
    return `file:${digest(readFileSync(path))}`;
  } catch (error) { return error?.code === "ENOENT" ? "missing" : "unreadable"; }
}

function captureWorkspaceSnapshot(root) {
  try {
    const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = {};
    for (const path of output.split("\0").filter(Boolean).sort()) {
      if (GENERATED_STATE_PATTERN.test(path)) continue;
      files[path] = workspaceFileDigest(resolve(root, path));
    }
    return { kind: "captured", files };
  } catch { return { kind: "unavailable", files: {} }; }
}

function workspaceSnapshotFindings(snapshot, root, allowedPaths = []) {
  if (snapshot?.kind !== "captured") return ["workspace baseline cannot be verified against the armed failure probe"];
  const current = captureWorkspaceSnapshot(root);
  if (current.kind !== "captured") return ["current workspace cannot be compared with the armed failure probe"];
  const allowed = new Set(allowedPaths);
  const changed = [...new Set([...Object.keys(snapshot.files ?? {}), ...Object.keys(current.files ?? {})])]
    .filter((path) => !allowed.has(path) && snapshot.files?.[path] !== current.files?.[path]);
  return changed.length > 0
    ? [`workspace changed after the behavioral failure probe was armed: ${changed.slice(0, 8).join(", ")}`]
    : [];
}

export function armedProbeWorkspaceFindings({ cwd, sessionId, allowedPaths = [] }) {
  const active = activeProbeCandidate({ cwd, sessionId });
  if (active.kind !== "active") return [];
  return workspaceSnapshotFindings(active.probe?.workspaceSnapshot, active.repoRoot, allowedPaths);
}

export function armedProbeRollbackCandidates({ cwd, sessionId, allowedPaths = [] }) {
  const active = activeProbeCandidate({ cwd, sessionId });
  if (active.kind !== "active" || active.probe?.workspaceSnapshot?.kind !== "captured") return [];
  const current = captureWorkspaceSnapshot(active.repoRoot);
  if (current.kind !== "captured") return [];
  const allowed = new Set(allowedPaths);
  return Object.keys(current.files ?? {}).filter((path) => {
    if (allowed.has(path) || Object.hasOwn(active.probe.workspaceSnapshot.files ?? {}, path)) return false;
    const absolute = resolve(active.repoRoot, path);
    if (!isManagedProofAsset(absolute, active.repoRoot) && !PYTHON_CACHE_FILE_PATTERN.test(path)) return false;
    try {
      const stat = lstatSync(absolute);
      return stat.isFile() || stat.isSymbolicLink();
    } catch { return false; }
  }).sort();
}

export function isArmedProbeRollbackCommand(command, cwd, repoRoot, candidates) {
  const words = directCommandWords(command);
  if (!words || words[0] !== "rm" || words[1] !== "-f") return false;
  const firstTarget = words[2] === "--" ? 3 : 2;
  if (words.length <= firstTarget) return false;
  const allowed = new Set(candidates);
  return words.slice(firstTarget).every((word) => {
    const path = resolve(cwd, word.replace(/^\.\//u, ""));
    const rel = relative(resolve(repoRoot), path).replaceAll("\\", "/");
    if (!allowed.has(rel)) return false;
    try {
      const stat = lstatSync(path);
      return stat.isFile() || stat.isSymbolicLink();
    } catch { return false; }
  });
}

function potentialProbeCommand(command) {
  return RUNNER_PATTERN.test(command)
    || AD_HOC_RUNTIME_PATTERN.test(command);
}

export function prepareProbeCandidate({ cwd, sessionId, command }) {
  if (!sessionId || !command || !potentialProbeCommand(command)) return { kind: "ignored" };
  const root = resolveRepoRoot(cwd);
  const stored = readProbe(sessionId, root);
  if (stored.kind === "ok" && stored.value.armed === true) return { kind: "active", repoRoot: root };
  writeProbe(sessionId, root, {
    armed: false,
    pendingCommandHash: digest(command.trim()),
    workspaceSnapshot: captureWorkspaceSnapshot(root),
  });
  return { kind: "prepared", repoRoot: root };
}

export function resolveRepoRoot(cwd) {
  try { return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return resolve(cwd); }
}

function isProbeCommand(command, output) {
  return RUNNER_PATTERN.test(command)
    || (AD_HOC_RUNTIME_PATTERN.test(command) && (PROBE_WORD_PATTERN.test(command) || STRONG_FAILURE_PATTERN.test(output)
      || BEHAVIORAL_WARNING_PATTERN.test(output) || CAPTURED_BEHAVIORAL_WARNING_PATTERN.test(output)
      || TYPED_BEHAVIORAL_WARNING_PATTERN.test(output)));
}

function hasFailureSignal(outcome, output) {
  if (FRAMEWORK_SETUP_FAILURE_PATTERN.test(output) && !EXPLICIT_BEHAVIOR_FAILURE_PATTERN.test(output)
    && !BEHAVIORAL_WARNING_PATTERN.test(output) && !CAPTURED_BEHAVIORAL_WARNING_PATTERN.test(output)
    && !TYPED_BEHAVIORAL_WARNING_PATTERN.test(output)) return false;
  return outcome === "failure" || STRONG_FAILURE_PATTERN.test(output) || BEHAVIORAL_WARNING_PATTERN.test(output)
    || CAPTURED_BEHAVIORAL_WARNING_PATTERN.test(output) || TYPED_BEHAVIORAL_WARNING_PATTERN.test(output);
}

export function observeProbeCandidate({ cwd, sessionId, command, outcome, output, outcomeBasis }) {
  if (!sessionId || !command || ["missing", "timeout", "unknown"].includes(outcome)) return { kind: "ignored" };
  const root = resolveRepoRoot(cwd);
  const commandHash = digest(command.trim());
  const stored = readProbe(sessionId, root);
  const probeCommand = isProbeCommand(command, output);
  if (probeCommand && hasFailureSignal(outcome, output)) {
    const alreadyArmed = stored.kind === "ok" && stored.value.armed === true;
    writeProbe(sessionId, root, {
      armed: true,
      commandHash,
      outcome,
      outcomeBasis,
      summary: String(output).replace(/\s+/gu, " ").slice(0, 240),
      commandsSinceArm: alreadyArmed ? Number(stored.value.commandsSinceArm ?? 0) : 0,
      reminderIssued: alreadyArmed && stored.value.reminderIssued === true,
      recoveryDenials: alreadyArmed ? Number(stored.value.recoveryDenials ?? 0) : 0,
      workspaceSnapshot: stored.kind === "ok" && (alreadyArmed || stored.value.pendingCommandHash === commandHash)
        ? stored.value.workspaceSnapshot
        : captureWorkspaceSnapshot(root),
    });
    return { kind: "armed", repoRoot: root };
  }
  if (probeCommand && ["success", "unreported"].includes(outcome) && stored.kind === "ok" && stored.value.commandHash === commandHash) {
    const findings = workspaceSnapshotFindings(stored.value.workspaceSnapshot, root);
    if (findings.length > 0) {
      writeProbe(sessionId, root, { ...stored.value, workspaceViolation: findings.join("; ") });
      return { kind: "violation", repoRoot: root, findings };
    }
    clearProbe(sessionId, root);
    return { kind: "cleared", repoRoot: root };
  }
  if (["success", "unreported"].includes(outcome) && stored.kind === "ok" && stored.value.pendingCommandHash === commandHash) {
    clearProbe(sessionId, root);
    return { kind: "cleared", repoRoot: root };
  }
  if (stored.kind === "ok" && stored.value.armed === true) {
    const commandsSinceArm = Number(stored.value.commandsSinceArm ?? 0) + 1;
    const reminderIssued = stored.value.reminderIssued === true || commandsSinceArm >= 3;
    writeProbe(sessionId, root, { ...stored.value, commandsSinceArm, reminderIssued });
    return { kind: !stored.value.reminderIssued && commandsSinceArm >= 3 ? "reminder" : "active", repoRoot: root };
  }
  return { kind: "ignored", repoRoot: root };
}

export function activeProbeCandidate({ cwd, sessionId, now = Date.now() }) {
  if (!sessionId) return { kind: "missing", repoRoot: resolveRepoRoot(cwd) };
  const root = resolveRepoRoot(cwd);
  const stored = readProbe(sessionId, root);
  if (stored.kind !== "ok" || stored.value.armed !== true) return { kind: stored.kind, repoRoot: root };
  if (now - Number(stored.value.updatedAt || 0) > PROBE_TTL_MS) {
    clearProbe(sessionId, root);
    return { kind: "expired", repoRoot: root };
  }
  return { kind: "active", repoRoot: root, probe: stored.value };
}

export function clearProbeCandidate({ cwd, sessionId }) {
  if (!sessionId) return false;
  return clearProbe(sessionId, resolveRepoRoot(cwd));
}

export function recordProbeRecoveryDenial({ cwd, sessionId }) {
  if (!sessionId) return 0;
  const root = resolveRepoRoot(cwd);
  const stored = readProbe(sessionId, root);
  if (stored.kind !== "ok" || stored.value.armed !== true) return 0;
  const count = Number(stored.value.recoveryDenials ?? 0) + 1;
  writeProbe(sessionId, root, { ...stored.value, recoveryDenials: count });
  return count;
}

export function targetRelativePaths(path, repoRoot) {
  const root = resolve(repoRoot);
  const target = resolve(path);
  const identities = new Set([relative(root, target).replaceAll("\\", "/")]);
  let ancestor = target;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) return [...identities];
    ancestor = parent;
  }
  try {
    const physicalTarget = resolve(realpathSync(ancestor), relative(ancestor, target));
    identities.add(relative(root, physicalTarget).replaceAll("\\", "/"));
  } catch { /* The caller treats the lexical identity conservatively. */ }
  return [...identities];
}

export function isManagedProofAsset(path, repoRoot) {
  const identities = targetRelativePaths(path, repoRoot);
  return identities.length > 0 && identities.every((rel) => rel
    && !rel.startsWith("../")
    && rel !== ".."
    && /^\.behavioral-regression\/BR-[A-Za-z0-9][A-Za-z0-9-]{2,80}(?:\.json|\/.+)$/u.test(rel));
}

export function isProofAsset(path, repoRoot, verificationPaths = []) {
  const rel = relative(resolve(repoRoot), resolve(path)).replaceAll("\\", "/");
  if (!rel || rel.startsWith("../") || rel === "..") return false;
  if (isManagedProofAsset(path, repoRoot)) return true;
  if (verificationPaths.includes(rel)) return true;
  return PROOF_DIRECTORY_PATTERN.test(rel) || PROOF_FILE_PATTERN.test(rel);
}
