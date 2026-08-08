import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { commandHash } from "./command-policy.mjs";

function inside(root, path) {
  const candidate = relative(root, path);
  return candidate === "" || (!candidate.startsWith("..") && !isAbsolute(candidate));
}

function summaryMatches(expected, actual) {
  if (!expected) return true;
  if (!actual) return false;
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameVersion(left, right) {
  return sameIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

async function hashHandle(handle) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  while (true) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

async function artifactFinding(item, workspaceRoot, maxBytes) {
  const root = await realpath(workspaceRoot);
  const target = resolve(root, item.path);
  if (!inside(root, target)) return `${item.id}: artifact path escapes the workspace`;
  let metadata;
  try { metadata = await lstat(target); } catch { return `${item.id}: artifact does not exist`; }
  if (metadata.isSymbolicLink()) return `${item.id}: artifact must not be a symbolic link`;
  if (!metadata.isFile()) return `${item.id}: artifact must be a regular file`;
  let actual;
  try { actual = await realpath(target); } catch { return `${item.id}: artifact cannot be resolved`; }
  if (!inside(root, actual)) return `${item.id}: resolved artifact escapes the workspace`;
  if (metadata.size !== item.bytes) return `${item.id}: artifact byte count does not match`;
  if (metadata.size > maxBytes) return `${item.id}: artifact exceeds automatic hash limit`;
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(target, flags);
  try {
    const before = await handle.stat();
    if (!sameIdentity(metadata, before)) return `${item.id}: artifact changed while being opened`;
    const digest = await hashHandle(handle);
    if (digest !== item.sha256) return `${item.id}: artifact sha256 does not match`;
    const sample = Buffer.alloc(Math.min(before.size, 8192));
    if (sample.length > 0) await handle.read(sample, 0, sample.length, 0);
    if (item.format === "json") {
      try { JSON.parse((await handle.readFile()).toString("utf8")); } catch { return `${item.id}: artifact is not valid JSON`; }
    } else if (item.format === "text") {
      try { new TextDecoder("utf-8", { fatal: true }).decode(await handle.readFile()); } catch { return `${item.id}: artifact is not valid UTF-8 text`; }
    } else if (item.format === "pdf" && !sample.subarray(0, 5).equals(Buffer.from("%PDF-"))) return `${item.id}: artifact is not a PDF`;
    else if (item.format === "png" && !sample.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return `${item.id}: artifact is not a PNG`;
    else if (item.format === "jpeg") {
      const ending = Buffer.alloc(2);
      if (before.size >= 2) await handle.read(ending, 0, 2, before.size - 2);
      if (!(sample[0] === 0xff && sample[1] === 0xd8 && ending[0] === 0xff && ending[1] === 0xd9)) return `${item.id}: artifact is not a JPEG`;
    }
    else if (item.format === "zip" && !(sample[0] === 0x50 && sample[1] === 0x4b)) return `${item.id}: artifact is not a ZIP`;
    const after = await handle.stat();
    let current;
    try { current = await lstat(target); } catch { return `${item.id}: artifact changed during verification`; }
    if (!sameVersion(before, after) || !sameIdentity(after, current) || current.isSymbolicLink()) {
      return `${item.id}: artifact changed during verification`;
    }
  } finally {
    await handle.close();
  }
  return null;
}

function commandFinding(item, predicate, state) {
  const hash = commandHash(item.command);
  const receipt = [...(state.receipts ?? [])].reverse().find((candidate) => candidate.commandHash === hash && candidate.outcome === "success");
  if (!receipt) return `${item.id}: no matching command receipt`;
  if (receipt.outcome !== "success" || receipt.reliable !== true) return `${item.id}: matching command receipt is not a reliable success`;
  if (receipt.revision !== state.revision) return `${item.id}: verification must run after the last mutation`;
  if ((state.promptEpoch ?? 0) > 0 && receipt.promptEpoch !== state.promptEpoch) {
    return `${item.id}: verification must run in the current user-prompt epoch`;
  }
  if (predicate === "test_suite_passed" && receipt.class !== "test") return `${item.id}: command is not classified as a test`;
  if (predicate === "verification_succeeded" && !["test", "verification"].includes(receipt.class)) return `${item.id}: command is not classified as verification`;
  if (!summaryMatches(item.summary, receipt.summary)) return `${item.id}: command summary does not match the observed output`;
  return null;
}

function gitFinding(item, workspaceRoot) {
  try {
    const options = { cwd: workspaceRoot, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] };
    const head = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
    const branch = execFileSync("git", ["branch", "--show-current"], options).trim();
    const clean = execFileSync("git", ["status", "--porcelain=v1"], options).trim() === "";
    if (head !== item.head) return `${item.id}: git HEAD does not match`;
    if (branch !== item.branch) return `${item.id}: git branch does not match`;
    if (clean !== item.clean) return `${item.id}: git clean state does not match`;
    return null;
  } catch {
    return `${item.id}: git state could not be verified`;
  }
}

function ciFinding(item, state) {
  const hash = commandHash(item.query);
  const receipt = [...(state.receipts ?? [])].reverse().find((candidate) => candidate.commandHash === hash && candidate.class === "ci");
  if (!receipt) return `${item.id}: no matching CI query receipt`;
  if (receipt.outcome !== "success" || receipt.reliable !== true || receipt.revision !== state.revision || !receipt.ci) {
    return `${item.id}: CI receipt is missing, stale, or unsuccessful`;
  }
  if ((state.promptEpoch ?? 0) > 0 && receipt.promptEpoch !== state.promptEpoch) {
    return `${item.id}: CI query must run in the current user-prompt epoch`;
  }
  const expected = { provider: item.provider, pipelineId: item.pipelineId, status: item.status, sha: item.sha, url: item.url };
  if (Object.entries(expected).some(([key, value]) => receipt.ci[key] !== value)) return `${item.id}: CI metadata does not match the observed result`;
  return null;
}

export async function validateEvidence(item, predicate, { state = {}, workspaceRoot, maxArtifactBytes = 64 * 1024 * 1024 }) {
  let finding;
  if (item.kind === "command") finding = commandFinding(item, predicate, state);
  else if (item.kind === "artifact") finding = await artifactFinding(item, workspaceRoot, maxArtifactBytes);
  else if (item.kind === "git") finding = gitFinding(item, workspaceRoot);
  else if (item.kind === "ci") finding = ciFinding(item, state);
  else finding = `${item.id}: unsupported evidence kind`;
  return finding ? [finding] : [];
}

export async function validateManifestEvidence(manifest, context) {
  const byId = new Map(manifest.evidence.map((item) => [item.id, item]));
  const findings = [];
  for (const claim of manifest.claims) {
    if (claim.status !== "verified") continue;
    for (const evidenceId of claim.evidence) {
      findings.push(...await validateEvidence(byId.get(evidenceId), claim.predicate, context));
    }
  }
  return [...new Set(findings)];
}
