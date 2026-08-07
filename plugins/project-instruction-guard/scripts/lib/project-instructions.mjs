import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { TextDecoder } from "node:util";

export const MANAGED_START = "<!-- ai-experts:project-instructions:start -->";
export const MANAGED_END = "<!-- ai-experts:project-instructions:end -->";

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_MANAGED_BYTES = 32 * 1024;
const MAX_MANAGED_LINES = 400;
const REVISION_ID_RE = /^[a-f0-9-]{36}$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function gitOutput(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
  }).trim();
}

export function resolveProjectRoot(workspace) {
  const requested = resolve(workspace || ".");
  try {
    return resolve(gitOutput(requested, ["rev-parse", "--show-toplevel"]));
  } catch {
    throw new Error(`project instruction maintenance requires a Git workspace: ${requested}`);
  }
}

export function resolveProjectRootOrNull(workspace) {
  try {
    return resolveProjectRoot(workspace);
  } catch {
    return null;
  }
}

function readBoundedBuffer(path, label) {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
  if (stat.size > MAX_SOURCE_BYTES) {
    throw new Error(`${label} exceeds ${MAX_SOURCE_BYTES} bytes`);
  }
  return readFileSync(path);
}

function decodeUtf8(buffer, label) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  try {
    return UTF8.decode(buffer);
  } catch {
    throw new Error(`${label} must be valid UTF-8`);
  }
}

function readRegularText(path, label) {
  if (!exists(path)) return null;
  const stat = lstatSync(path);
  if (!stat.isFile()) return null;
  return decodeUtf8(readBoundedBuffer(path, label), label);
}

function pathState(path) {
  if (!exists(path)) return { kind: "missing" };
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return { kind: "symlink", target: readlinkSync(path) };
  if (stat.isFile()) {
    if (stat.size > MAX_SOURCE_BYTES) return { kind: "file", size: stat.size, sha256: null };
    return { kind: "file", size: stat.size, sha256: sha256(readFileSync(path)) };
  }
  if (stat.isDirectory()) return { kind: "directory" };
  return { kind: "other" };
}

function markerOffsets(text, marker) {
  const offsets = [];
  for (let at = text.indexOf(marker); at >= 0; at = text.indexOf(marker, at + marker.length)) {
    offsets.push(at);
  }
  return offsets;
}

export function markerState(text) {
  const starts = markerOffsets(text, MANAGED_START);
  const ends = markerOffsets(text, MANAGED_END);
  const start = starts[0];
  const end = ends[0];
  const valid = starts.length === 1 && ends.length === 1 && end > start;
  return {
    valid,
    starts,
    ends,
    ...(valid ? { start, end, endOffset: end + MANAGED_END.length } : {}),
  };
}

function sharedReadme(agents, claude) {
  return agents.kind === "symlink"
    && agents.target === "README.md"
    && claude.kind === "symlink"
    && claude.target === "README.md";
}

function sourceName(agents, claude) {
  return sharedReadme(agents, claude) ? "README.md" : "AGENTS.md";
}

function validateState(root, instructionSource, source, agents, claude) {
  const findings = [];
  const sourcePath = join(root, instructionSource);
  if (source.kind !== "file") {
    findings.push(`${instructionSource} must be the canonical regular file at the Git root.`);
  } else if (source.size > MAX_SOURCE_BYTES) {
    findings.push(`${instructionSource} exceeds ${MAX_SOURCE_BYTES} bytes.`);
  } else {
    try {
      const text = readRegularText(sourcePath, instructionSource);
      const markers = markerState(text);
      if (!markers.valid) findings.push(`${instructionSource} must contain exactly one ordered managed block.`);
    } catch (error) {
      findings.push(error.message);
    }
  }
  if (instructionSource === "README.md") {
    if (!sharedReadme(agents, claude)) {
      findings.push("AGENTS.md and CLAUDE.md must both be the relative symlink README.md.");
    }
  } else if (claude.kind !== "symlink" || claude.target !== "AGENTS.md") {
    findings.push("CLAUDE.md must be the relative symlink AGENTS.md.");
  }
  return findings;
}

export function inspectProjectInstructions(workspace) {
  const root = resolveProjectRoot(workspace);
  const agents = pathState(join(root, "AGENTS.md"));
  const claude = pathState(join(root, "CLAUDE.md"));
  const instructionSource = sourceName(agents, claude);
  const source = instructionSource === "AGENTS.md" ? agents : pathState(join(root, "README.md"));
  const findings = validateState(root, instructionSource, source, agents, claude);
  const stateDigest = sha256(JSON.stringify({ instructionSource, source, agents, claude }));
  return { root, instructionSource, source, agents, claude, stateDigest, valid: findings.length === 0, findings };
}

function managedBlock(body) {
  const normalized = body.trim();
  return [MANAGED_START, ...(normalized ? [normalized] : []), MANAGED_END].join("\n");
}

function insertionPrefix(source, instructionSource) {
  if (source === null || source.length === 0) return `# ${instructionSource}\n\n`;
  if (source.endsWith("\n\n")) return source;
  return source.endsWith("\n") ? `${source}\n` : `${source}\n\n`;
}

function appendManagedBlock(source, body, instructionSource) {
  return `${insertionPrefix(source, instructionSource)}${managedBlock(body)}\n`;
}

function managedBody(text) {
  const markers = markerState(text);
  if (!markers.valid) return "";
  return text
    .slice(markers.start + MANAGED_START.length, markers.end)
    .replace(/^\r?\n/u, "")
    .replace(/\r?\n$/u, "");
}

function replaceManagedBody(text, body) {
  const markers = markerState(text);
  if (!markers.valid) throw new Error("managed block is malformed");
  return `${text.slice(0, markers.start)}${managedBlock(body)}${text.slice(markers.endOffset)}`;
}

function sensitiveFinding(text) {
  const patterns = [
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, "private key"],
    [/\bgh[oprsu]_[A-Za-z0-9]{20,}\b/u, "GitHub token"],
    [/\bsk-[A-Za-z0-9]{20,}\b/u, "API key"],
    [/\bAKIA[A-Z0-9]{16}\b/u, "AWS access key"],
    [/(?:^|\n)[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD)\s*=\s*[^\s<${}][^\s]{7,}/u, "credential assignment"],
    [/(?:\/Users|\/home)\/[A-Za-z0-9._-]+\//u, "personal absolute path"],
    [/[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/u, "personal absolute path"],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function validateManagedBody(body) {
  if (Buffer.byteLength(body, "utf8") > MAX_MANAGED_BYTES) {
    throw new Error(`managed block exceeds ${MAX_MANAGED_BYTES} bytes`);
  }
  if (body.split(/\r?\n/u).length > MAX_MANAGED_LINES) {
    throw new Error(`managed block exceeds ${MAX_MANAGED_LINES} lines`);
  }
  if (/^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/mu.test(body)) {
    throw new Error("managed block contains unresolved merge markers");
  }
  const sensitive = sensitiveFinding(body);
  if (sensitive) throw new Error(`managed block contains sensitive material: ${sensitive}`);
}

function defaultMaintenanceBody(instructionSource) {
  const sourceRule = instructionSource === "README.md"
    ? "- Treat this root README.md as the shared instruction source; AGENTS.md and CLAUDE.md must remain its relative symlinks."
    : "- Treat this root AGENTS.md as canonical; CLAUDE.md must remain its relative symlink.";
  return [
    "## Project instruction maintenance",
    "",
    sourceRule,
    "- Update only this managed block automatically; preserve project-authored text outside it.",
  ].join("\n");
}

function automaticDocument(instructionSource, source, claude) {
  const legacy = claude?.trim() ?? "";
  const maintenance = defaultMaintenanceBody(instructionSource);
  if (source === null) {
    const body = legacy ? `${maintenance}\n\n## Migrated from CLAUDE.md\n\n${legacy}` : maintenance;
    validateManagedBody(body);
    return appendManagedBlock(null, body, instructionSource);
  }
  const markers = markerState(source);
  if (markers.starts.length > 0 || markers.ends.length > 0) {
    if (!markers.valid) throw new Error(`${instructionSource} managed block is malformed; user review is required`);
    if (!legacy || source.includes(legacy)) return source;
    const body = `${managedBody(source)}\n\n## Migrated from CLAUDE.md\n\n${legacy}`;
    validateManagedBody(body);
    return replaceManagedBody(source, body);
  }
  const body = legacy && !source.includes(legacy)
    ? `${maintenance}\n\n## Migrated from CLAUDE.md\n\n${legacy}`
    : maintenance;
  validateManagedBody(body);
  return appendManagedBlock(source, body, instructionSource);
}

function candidateDocument(candidateFile, instructionSource, source, claude) {
  const path = resolve(candidateFile);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("candidateFile must be a regular file, not a symlink");
  const candidate = decodeUtf8(readBoundedBuffer(path, "candidateFile"), "candidateFile");
  const candidateMarkers = markerState(candidate);
  if (!candidateMarkers.valid) throw new Error("candidate must contain exactly one ordered managed block");
  validateManagedBody(managedBody(candidate));
  if (source !== null) {
    const currentMarkers = markerState(source);
    if (currentMarkers.valid) {
      if (
        source.slice(0, currentMarkers.start) !== candidate.slice(0, candidateMarkers.start)
        || source.slice(currentMarkers.endOffset) !== candidate.slice(candidateMarkers.endOffset)
      ) {
        throw new Error("candidate changes content outside the managed block");
      }
    } else if (currentMarkers.starts.length > 0 || currentMarkers.ends.length > 0) {
      throw new Error(`${instructionSource} managed block is malformed; user review is required`);
    } else if (candidate.slice(0, candidateMarkers.start) !== insertionPrefix(source, instructionSource)) {
      throw new Error("candidate changes content outside the managed block");
    }
  }
  const legacy = claude?.trim();
  if (legacy && !candidate.includes(legacy) && !source?.includes(legacy)) {
    throw new Error("candidate does not preserve effective rules from CLAUDE.md");
  }
  return candidate;
}

function assertReplaceable(state) {
  if (state.instructionSource === "README.md") {
    if (state.source.kind !== "file") throw new Error("README.md must be a regular file before reconciliation");
    return;
  }
  if (!["missing", "file"].includes(state.agents.kind)) {
    throw new Error("AGENTS.md must be missing or a regular file before reconciliation");
  }
  const claudeReplaceable = ["missing", "file"].includes(state.claude.kind)
    || (state.claude.kind === "symlink" && state.claude.target === "AGENTS.md");
  if (!claudeReplaceable) throw new Error("refusing to replace a non-canonical CLAUDE.md symlink or path");
}

function capturePath(path) {
  const state = pathState(path);
  if (state.kind === "missing") return { kind: "missing" };
  if (state.kind === "symlink") return { kind: "symlink", target: state.target };
  if (state.kind !== "file") throw new Error(`${path} must be missing, a regular file, or a symlink`);
  const stat = lstatSync(path);
  const content = readBoundedBuffer(path, path);
  return { kind: "file", contentBase64: content.toString("base64"), mode: stat.mode & 0o777 };
}

function privateRevisionRoot(root) {
  const gitPath = gitOutput(root, ["rev-parse", "--git-path", "harness-start/project-instruction-guard"]);
  return isAbsolute(gitPath) ? resolve(gitPath) : resolve(root, gitPath);
}

function revisionPath(root, revisionId) {
  if (!REVISION_ID_RE.test(revisionId)) throw new Error("invalid project instruction revision ID");
  return join(privateRevisionRoot(root), "revisions", revisionId, "manifest.json");
}

function atomicWrite(path, content, mode, replace = true) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, mode);
    if (!replace && exists(path)) throw new Error(`refusing to overwrite existing file: ${path}`);
    renameSync(temporary, path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

function writeManifest(path, manifest) {
  atomicWrite(path, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"), 0o600, true);
}

function readManifest(root, revisionId) {
  const path = revisionPath(root, revisionId);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SOURCE_BYTES) {
    throw new Error(`invalid project instruction revision: ${revisionId}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`project instruction revision not found: ${revisionId}`);
  }
  if (manifest?.schema !== 1 || manifest.revisionId !== revisionId || manifest.root !== root) {
    throw new Error(`invalid project instruction revision: ${revisionId}`);
  }
  return manifest;
}

function removeExisting(path) {
  if (!exists(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`refusing to replace non-file path: ${path}`);
  unlinkSync(path);
}

function restorePath(path, captured) {
  removeExisting(path);
  if (captured.kind === "missing") return;
  if (captured.kind === "symlink") {
    if (!captured.target) throw new Error(`revision is missing symlink target for ${path}`);
    symlinkSync(captured.target, path);
    return;
  }
  if (captured.contentBase64 === undefined) throw new Error(`revision is missing file content for ${path}`);
  atomicWrite(path, Buffer.from(captured.contentBase64, "base64"), captured.mode ?? 0o644, true);
}

function applyDocument(root, content, instructionSource, operation, parentRevisionId) {
  const beforeState = inspectProjectInstructions(root);
  const paths = {
    agents: join(root, "AGENTS.md"),
    claude: join(root, "CLAUDE.md"),
    readme: join(root, "README.md"),
  };
  const before = {
    agents: capturePath(paths.agents),
    claude: capturePath(paths.claude),
    ...(instructionSource === "README.md" ? { readme: capturePath(paths.readme) } : {}),
  };
  const revisionId = randomUUID();
  const manifestPath = revisionPath(root, revisionId);
  const manifest = {
    schema: 1,
    revisionId,
    root,
    createdAt: new Date().toISOString(),
    status: "pending",
    operation,
    ...(parentRevisionId ? { parentRevisionId } : {}),
    beforeDigest: beforeState.stateDigest,
    before,
  };
  writeManifest(manifestPath, manifest);
  try {
    const capturedSource = instructionSource === "README.md" ? before.readme : before.agents;
    atomicWrite(join(root, instructionSource), Buffer.from(content, "utf8"), capturedSource?.mode ?? 0o644, true);
    if (instructionSource === "AGENTS.md") {
      removeExisting(paths.claude);
      symlinkSync("AGENTS.md", paths.claude);
    }
    const after = inspectProjectInstructions(root);
    if (!after.valid) throw new Error(`post-write verification failed: ${after.findings.join(" ")}`);
    manifest.status = "committed";
    manifest.afterDigest = after.stateDigest;
    writeManifest(manifestPath, manifest);
    return { changed: beforeState.stateDigest !== after.stateDigest, revisionId, beforeDigest: beforeState.stateDigest, afterDigest: after.stateDigest, state: after };
  } catch (error) {
    let restoreError;
    try {
      if (before.readme) restorePath(paths.readme, before.readme);
      restorePath(paths.agents, before.agents);
      restorePath(paths.claude, before.claude);
    } catch (cause) {
      restoreError = cause;
    }
    manifest.status = "failed";
    manifest.error = error instanceof Error ? error.message : String(error);
    writeManifest(manifestPath, manifest);
    if (restoreError) throw new AggregateError([error, restoreError], "project instruction write and rollback both failed");
    throw error;
  }
}

export function reconcileProjectInstructions({ workspace, expectedStateDigest, candidateFile }) {
  if (!SHA256_RE.test(expectedStateDigest ?? "")) throw new Error("expectedStateDigest must be a SHA-256 digest");
  const before = inspectProjectInstructions(workspace);
  if (before.stateDigest !== expectedStateDigest) throw new Error("project instruction state digest is stale; inspect again before writing");
  assertReplaceable(before);
  const sourcePath = join(before.root, before.instructionSource);
  const source = readRegularText(sourcePath, before.instructionSource);
  const claude = before.instructionSource === "AGENTS.md"
    ? readRegularText(join(before.root, "CLAUDE.md"), "CLAUDE.md")
    : null;
  const desired = candidateFile
    ? candidateDocument(candidateFile, before.instructionSource, source, claude)
    : automaticDocument(before.instructionSource, source, claude);
  if (Buffer.byteLength(desired, "utf8") > MAX_SOURCE_BYTES) throw new Error(`${before.instructionSource} exceeds ${MAX_SOURCE_BYTES} bytes`);
  if (source === desired && before.valid) {
    return { changed: false, revisionId: "none", beforeDigest: before.stateDigest, afterDigest: before.stateDigest, state: before };
  }
  return applyDocument(before.root, desired, before.instructionSource, "reconcile");
}

export function rollbackProjectInstructions({ workspace, expectedStateDigest, revisionId }) {
  if (!SHA256_RE.test(expectedStateDigest ?? "")) throw new Error("expectedStateDigest must be a SHA-256 digest");
  const current = inspectProjectInstructions(workspace);
  if (current.stateDigest !== expectedStateDigest) throw new Error("project instruction state digest is stale; inspect again before rollback");
  const source = readManifest(current.root, revisionId);
  if (source.status !== "committed") throw new Error(`project instruction revision is not committed: ${revisionId}`);
  if (source.afterDigest !== current.stateDigest) {
    throw new Error(`project instruction revision is not the current head: ${revisionId}`);
  }
  const paths = { agents: join(current.root, "AGENTS.md"), claude: join(current.root, "CLAUDE.md"), readme: join(current.root, "README.md") };
  const rollbackId = randomUUID();
  const before = {
    agents: capturePath(paths.agents),
    claude: capturePath(paths.claude),
    ...(source.before.readme ? { readme: capturePath(paths.readme) } : {}),
  };
  const manifestPath = revisionPath(current.root, rollbackId);
  const manifest = {
    schema: 1,
    revisionId: rollbackId,
    root: current.root,
    createdAt: new Date().toISOString(),
    status: "pending",
    operation: "rollback",
    parentRevisionId: revisionId,
    beforeDigest: current.stateDigest,
    before,
  };
  writeManifest(manifestPath, manifest);
  try {
    if (source.before.readme) restorePath(paths.readme, source.before.readme);
    restorePath(paths.agents, source.before.agents);
    restorePath(paths.claude, source.before.claude);
    const after = inspectProjectInstructions(current.root);
    manifest.status = "committed";
    manifest.afterDigest = after.stateDigest;
    writeManifest(manifestPath, manifest);
    return { changed: current.stateDigest !== after.stateDigest, revisionId: rollbackId, beforeDigest: current.stateDigest, afterDigest: after.stateDigest, state: after };
  } catch (error) {
    if (before.readme) restorePath(paths.readme, before.readme);
    restorePath(paths.agents, before.agents);
    restorePath(paths.claude, before.claude);
    manifest.status = "failed";
    manifest.error = error instanceof Error ? error.message : String(error);
    writeManifest(manifestPath, manifest);
    throw error;
  }
}

export function verifyProjectInstructions({ workspace, decision, expectedRevisionId }) {
  if (!["no-change", "changed", "rollback"].includes(decision)) {
    throw new Error("decision must be no-change, changed, or rollback");
  }
  if (decision !== "no-change" && !expectedRevisionId) {
    throw new Error("expectedRevisionId is required after a mutation");
  }
  const state = inspectProjectInstructions(workspace);
  const findings = decision === "rollback" ? [] : [...state.findings];
  let revision;
  if (expectedRevisionId) {
    try {
      revision = readManifest(state.root, expectedRevisionId);
      if (revision.status !== "committed") findings.push(`revision ${expectedRevisionId} is not committed`);
      else if (revision.afterDigest !== state.stateDigest) findings.push(`revision ${expectedRevisionId} does not match current state`);
      else if (decision === "rollback" && revision.operation !== "rollback") findings.push(`revision ${expectedRevisionId} is not a rollback revision`);
    } catch (error) {
      findings.push(error.message);
    }
  }
  return {
    ok: findings.length === 0,
    decision,
    stateDigest: state.stateDigest,
    ...(expectedRevisionId ? { revisionId: expectedRevisionId } : {}),
    ...(revision?.parentRevisionId ? { parentRevisionId: revision.parentRevisionId } : {}),
    findings,
    state,
  };
}
