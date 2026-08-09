#!/usr/bin/env node

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const FENCE = /```git-state-evidence[ \t]*\r?\n([\s\S]*?)\r?\n```/gu;
const FENCE_OPEN = /^```git-state-evidence[ \t]*(?:\r?\n|$)/gmu;
const MAX_BLOCK_BYTES = 16 * 1024;
const HEAD = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const GIT_OPTIONS = { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 3000 };

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
  process.stderr.write(`[git-state-evidence-guard] ${message}\n`);
}

function exactKeys(value, expected) {
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function parseBlock(message) {
  const matches = [...message.matchAll(FENCE)];
  const openers = [...message.matchAll(FENCE_OPEN)];
  if (openers.length === 0) return { kind: "absent" };
  if (openers.length !== 1 || matches.length !== 1) return { kind: "malformed", reason: "expected exactly one git-state-evidence block" };
  const raw = matches[0][1];
  if (Buffer.byteLength(raw, "utf8") > MAX_BLOCK_BYTES) {
    return { kind: "malformed", reason: `block exceeds ${MAX_BLOCK_BYTES} bytes` };
  }
  let value;
  try { value = JSON.parse(raw); } catch { return { kind: "malformed", reason: "block is not valid JSON" }; }
  const expected = new Set(["schema", "head", "branch", "clean"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || !exactKeys(value, expected)) {
    return { kind: "malformed", reason: "block must contain only schema, head, branch, and clean" };
  }
  if (value.schema !== "git-state-evidence/v1") return { kind: "malformed", reason: "schema must be git-state-evidence/v1" };
  if (typeof value.head !== "string" || !HEAD.test(value.head)) return { kind: "malformed", reason: "head is invalid" };
  if (value.branch !== null && (typeof value.branch !== "string" || value.branch.length < 1 || value.branch.length > 1024 || /[\0\r\n]/u.test(value.branch))) {
    return { kind: "malformed", reason: "branch must be null or a bounded branch name" };
  }
  if (typeof value.clean !== "boolean") return { kind: "malformed", reason: "clean must be boolean" };
  return { kind: "valid", value };
}

async function git(cwd, args) {
  return (await runFile("git", ["-C", cwd, ...args], GIT_OPTIONS)).stdout.trimEnd();
}

async function branch(cwd) {
  try {
    return await git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch (error) {
    if (error?.code === 1 && !error?.killed && !error?.signal) return null;
    throw error;
  }
}

async function snapshot(cwd) {
  const head = await git(cwd, ["rev-parse", "--verify", "HEAD"]);
  const currentBranch = await branch(cwd);
  const status = await git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return { head, branch: currentBranch, clean: status.length === 0 };
}

function sameState(left, right) {
  return left.head === right.head && left.branch === right.branch && left.clean === right.clean;
}

function stopBlock(findings) {
  return {
    decision: "block",
    reason: [
      "[Git State Evidence Guard] Explicit Git state evidence contradicts the current repository:",
      ...findings.map((finding) => `- ${finding}`),
      "Correct or remove the git-state-evidence block.",
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

  const cwd = resolve(event?.cwd ?? process.cwd());
  let first;
  let second;
  try {
    first = await snapshot(cwd);
    second = await snapshot(cwd);
  } catch (error) {
    warn(`failed open: Git state is unavailable${error?.killed ? " (timeout)" : ""}`);
    return;
  }
  if (!sameState(first, second)) {
    warn("failed open: Git state changed during verification");
    return;
  }

  const findings = [];
  if (parsed.value.head !== first.head) findings.push("HEAD does not match");
  if (parsed.value.branch !== first.branch) findings.push("branch does not match");
  if (parsed.value.clean !== first.clean) findings.push("clean does not match");
  if (findings.length > 0) process.stdout.write(`${JSON.stringify(stopBlock(findings))}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => warn(`failed open: ${error instanceof Error ? error.message : String(error)}`));
}
