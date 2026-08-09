#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FENCE = /```artifact-evidence[ \t]*\r?\n([\s\S]*?)\r?\n```/gu;
const FENCE_OPEN = /^```artifact-evidence[ \t]*(?:\r?\n|$)/gmu;
const MAX_BLOCK_BYTES = 16 * 1024;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_ITEMS = 20;
const SHA256 = /^[a-f0-9]{64}$/u;
const FORMATS = new Set(["text", "json", "pdf", "png", "jpeg", "zip", "binary"]);

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function assistantMessage(event) {
  const value = event?.last_assistant_message
    ?? event?.lastAssistantMessage
    ?? event?.assistant_text
    ?? event?.assistantText
    ?? "";
  return typeof value === "string" ? value : "";
}

function warn(message) {
  process.stderr.write(`[artifact-evidence-guard] ${message}\n`);
}

function inside(root, target) {
  const candidate = relative(root, target);
  return candidate === "" || (!candidate.startsWith("..") && !isAbsolute(candidate));
}

function exactKeys(value, expected) {
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function parseBlock(message) {
  const matches = [...message.matchAll(FENCE)];
  const openers = [...message.matchAll(FENCE_OPEN)];
  if (openers.length === 0) return { kind: "absent" };
  if (openers.length !== 1 || matches.length !== 1) return { kind: "malformed", reason: "expected exactly one artifact-evidence block" };
  const raw = matches[0][1];
  if (Buffer.byteLength(raw, "utf8") > MAX_BLOCK_BYTES) {
    return { kind: "malformed", reason: `block exceeds ${MAX_BLOCK_BYTES} bytes` };
  }
  let value;
  try { value = JSON.parse(raw); } catch { return { kind: "malformed", reason: "block is not valid JSON" }; }
  if (!value || typeof value !== "object" || Array.isArray(value) || !exactKeys(value, new Set(["schema", "artifacts"]))) {
    return { kind: "malformed", reason: "block must contain only schema and artifacts" };
  }
  if (value.schema !== "artifact-evidence/v1" || !Array.isArray(value.artifacts) || value.artifacts.length < 1 || value.artifacts.length > MAX_ITEMS) {
    return { kind: "malformed", reason: `schema must be artifact-evidence/v1 with 1..${MAX_ITEMS} artifacts` };
  }
  const seen = new Set();
  for (const [index, item] of value.artifacts.entries()) {
    const expected = new Set(["path", "bytes", "sha256", "format"]);
    if (!item || typeof item !== "object" || Array.isArray(item) || !exactKeys(item, expected)) {
      return { kind: "malformed", reason: `artifacts[${index}] has an invalid shape` };
    }
    if (typeof item.path !== "string" || !item.path || isAbsolute(item.path) || item.path.includes("\\")) {
      return { kind: "malformed", reason: `artifacts[${index}].path must be a relative POSIX path` };
    }
    const segments = item.path.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
      return { kind: "malformed", reason: `artifacts[${index}].path contains an unsupported segment` };
    }
    if (seen.has(item.path)) return { kind: "malformed", reason: `duplicate artifact path: ${item.path}` };
    seen.add(item.path);
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0) return { kind: "malformed", reason: `artifacts[${index}].bytes is invalid` };
    if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) return { kind: "malformed", reason: `artifacts[${index}].sha256 is invalid` };
    if (!FORMATS.has(item.format)) return { kind: "malformed", reason: `artifacts[${index}].format is unsupported` };
  }
  return { kind: "valid", artifacts: value.artifacts };
}

function sameVersion(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function formatMatches(format, bytes) {
  if (format === "binary") return true;
  if (format === "text") {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return true; } catch { return false; }
  }
  if (format === "json") {
    try { JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); return true; } catch { return false; }
  }
  if (format === "pdf") return bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
  if (format === "png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (format === "jpeg") return bytes.length >= 4
    && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (format === "zip") return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  return false;
}

async function inspectArtifact(root, item) {
  const target = resolve(root, item.path);
  if (!inside(root, target)) return { kind: "indeterminate", reason: `${item.path}: path escapes the workspace` };
  let metadata;
  try { metadata = await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") return { kind: "mismatch", reason: `${item.path}: artifact does not exist` };
    return { kind: "indeterminate", reason: `${item.path}: artifact metadata is unavailable` };
  }
  if (metadata.isSymbolicLink()) return { kind: "mismatch", reason: `${item.path}: artifact is a symbolic link` };
  if (!metadata.isFile()) return { kind: "mismatch", reason: `${item.path}: artifact is not a regular file` };
  if (metadata.size > MAX_ARTIFACT_BYTES) {
    return { kind: "indeterminate", reason: `${item.path}: artifact exceeds the ${MAX_ARTIFACT_BYTES}-byte verification limit` };
  }
  if (metadata.size !== item.bytes) return { kind: "mismatch", reason: `${item.path}: byte count does not match` };
  let actual;
  try { actual = await realpath(target); } catch { return { kind: "indeterminate", reason: `${item.path}: artifact cannot be resolved` }; }
  if (!inside(root, actual)) return { kind: "indeterminate", reason: `${item.path}: resolved artifact escapes the workspace` };
  let handle;
  try { handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); } catch {
    return { kind: "indeterminate", reason: `${item.path}: artifact cannot be opened safely` };
  }
  try {
    const before = await handle.stat();
    if (!sameVersion(metadata, before)) return { kind: "indeterminate", reason: `${item.path}: artifact changed before verification` };
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameVersion(before, after)) return { kind: "indeterminate", reason: `${item.path}: artifact changed during verification` };
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== item.sha256) return { kind: "mismatch", reason: `${item.path}: sha256 does not match` };
    if (!formatMatches(item.format, bytes)) return { kind: "mismatch", reason: `${item.path}: format does not match ${item.format}` };
    return { kind: "match" };
  } finally {
    await handle.close();
  }
}

function stopBlock(findings) {
  return {
    decision: "block",
    reason: [
      "[Artifact Evidence Guard] Explicit artifact evidence could not be established from the current workspace:",
      ...findings.map((finding) => `- ${finding}`),
      "Correct or remove the artifact-evidence block; mark the artifact unverified when it cannot be checked.",
    ].join("\n"),
  };
}

export async function main(mode = process.argv[2]) {
  if (mode !== "stop") return;
  const event = await readEvent();
  const parsed = parseBlock(assistantMessage(event));
  if (parsed.kind === "absent") return;
  if (parsed.kind === "malformed") {
    warn(`failed open: ${parsed.reason}`);
    return;
  }
  let root;
  try { root = await realpath(resolve(event?.cwd ?? process.cwd())); } catch {
    warn("failed open: workspace could not be resolved");
    return;
  }
  const results = [];
  for (const item of parsed.artifacts) results.push(await inspectArtifact(root, item));
  const mismatches = results.filter((result) => result.kind === "mismatch").map((result) => result.reason);
  const indeterminate = results.filter((result) => result.kind === "indeterminate").map((result) => result.reason);
  for (const finding of indeterminate) warn(`failed open: ${finding}`);
  if (mismatches.length > 0) process.stdout.write(`${JSON.stringify(stopBlock(mismatches))}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => warn(`failed open: ${error instanceof Error ? error.message : String(error)}`));
}
