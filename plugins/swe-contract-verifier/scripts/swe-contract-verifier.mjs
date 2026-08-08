#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = 1;
const TTL_MS = 2 * 60 * 60 * 1000;
const FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;
const SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;
const TEST_COMMAND = /\b(?:node\s+--test|pytest|python(?:3)?\s+-m\s+pytest|phpunit|pest|jest|vitest|go\s+test|cargo\s+test|mvn\s+test|gradlew?\s+test|rspec|ctest|make\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+(?:run\s+)?test|bun\s+test)\b/iu;
const UNRELIABLE_COMMAND = /(?:\|\|\s*(?:true|:)|;\s*true|\bset\s+\+e\b|(?:&&|\|\||;|\n)\s*\S)/iu;
const SHELL_MUTATION = /(?:\bsed\s+-i\b|\bperl\s+-pi\b|\bgit\s+apply\b|\bpatch\s+-p\d|(?:^|[\s;&|])(?:cp|mv|rm|install|truncate)\s|(?:^|[\s;&|])(?:\d*>{1,2}(?!&)|tee\s))/iu;
const REVIEW_MARKER = "SWE_CONTRACT_REVIEW_V1";
const REQUIRED_FIELDS = [
  "issue_contract",
  "normal_path",
  "empty_or_zero",
  "boundary",
  "error_path",
  "regression_scope",
];

const SESSION_CONTEXT = [
  "[SWE Contract Verifier] Source changes require two fresh receipts after the final mutation: a successful relevant test command and an independent read-only subagent review.",
  "Use the bundled `swe-contract-verification` Skill. The reviewer must inspect the issue contract, public API, diff, and tests; it must not edit files or rely on hidden evaluator tests.",
  "Ask the reviewer to end with the exact SWE_CONTRACT_REVIEW_V1 report. Any later source edit invalidates both receipts.",
].join("\n");

const REVIEWER_CONTEXT = [
  "[SWE Contract Verifier] If you were assigned an independent contract review, remain read-only and review the current final diff rather than the implementer's narrative.",
  "Check issue_contract, normal_path, empty_or_zero, boundary, error_path, and regression_scope. End with the exact SWE_CONTRACT_REVIEW_V1 format from the bundled Skill only when the verdict is PASS.",
].join("\n");

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function emptyState() {
  return { version: VERSION, revision: 0, mutations: 0, testReceipt: null, reviewReceipt: null, stopBlocks: 0, updatedAt: 0 };
}

function extract(event, ...keys) {
  for (const key of keys) if (event?.[key] !== undefined) return event[key];
  return undefined;
}

function statePath(event) {
  const data = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
  const session = extract(event, "session_id", "sessionId", "sessionID") ?? event?.context?.session_id;
  if (!data || !session) return null;
  const cwd = resolve(extract(event, "cwd", "working_directory", "workingDirectory") ?? process.cwd());
  return join(resolve(data), "swe-contract-verifier", `${digest(`${session}\0${cwd}`)}.json`);
}

function sanitize(value) {
  if (!value || value.version !== VERSION || Date.now() - Number(value.updatedAt || 0) > TTL_MS) return emptyState();
  return {
    version: VERSION,
    revision: Number.isSafeInteger(value.revision) ? value.revision : 0,
    mutations: Number.isSafeInteger(value.mutations) ? value.mutations : 0,
    testReceipt: value.testReceipt && typeof value.testReceipt === "object" ? value.testReceipt : null,
    reviewReceipt: value.reviewReceipt && typeof value.reviewReceipt === "object" ? value.reviewReceipt : null,
    stopBlocks: Number.isSafeInteger(value.stopBlocks) ? value.stopBlocks : 0,
    updatedAt: Number(value.updatedAt) || 0,
  };
}

function readState(event) {
  const path = statePath(event);
  if (!path) return emptyState();
  try { return sanitize(JSON.parse(readFileSync(path, "utf8"))); } catch { return emptyState(); }
}

function updateState(event, updater) {
  const path = statePath(event);
  if (!path) return { state: emptyState(), result: null };
  const state = readState(event);
  const result = updater(state);
  state.updatedAt = Date.now();
  const directory = dirname(path);
  const temporary = join(directory, `.${digest(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } catch {
    try { rmSync(temporary, { force: true }); } catch {}
  }
  return { state, result };
}

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
}

function toolName(event) {
  return String(extract(event, "tool_name", "toolName") ?? event?.tool?.name ?? "");
}

function toolInput(event) {
  return extract(event, "tool_input", "toolInput", "input") ?? event?.tool?.input ?? {};
}

function shellCommand(event) {
  if (!SHELL_TOOLS.test(toolName(event))) return null;
  const input = toolInput(event);
  const command = input?.command ?? input?.cmd ?? input?.script;
  return typeof command === "string" ? command : null;
}

function successfulResponse(event, forcedFailure) {
  if (forcedFailure) return false;
  const response = extract(event, "tool_response", "toolResponse", "tool_result", "toolResult", "response") ?? event?.tool?.response;
  if (response && typeof response === "object") {
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (typeof code === "number") return code === 0;
    if (response.success === false || response.is_error === true || response.isError === true) return false;
  }
  const text = typeof response === "string" ? response : JSON.stringify(response ?? "");
  const matches = [...text.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?\d+)/giu)];
  return matches.length === 0 || Number(matches.at(-1)[1]) === 0;
}

export function parseReview(message) {
  const text = String(message ?? "").trim();
  if (!text.startsWith(REVIEW_MARKER)) return { valid: false, reason: "missing marker" };
  const fields = {};
  for (const line of text.split("\n").slice(1)) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/u);
    if (match) fields[match[1]] = match[2].trim();
  }
  if (fields.verdict !== "PASS") return { valid: false, reason: "verdict is not PASS" };
  for (const field of REQUIRED_FIELDS) {
    const value = fields[field] ?? "";
    const allowed = value === "covered" || /^not_applicable:\s*\S.+/u.test(value);
    if (!allowed) return { valid: false, reason: `invalid ${field}` };
  }
  for (const field of ["issue_contract", "normal_path", "regression_scope"]) {
    if (fields[field] !== "covered") return { valid: false, reason: `${field} must be covered` };
  }
  if (!fields.test_scope) return { valid: false, reason: "missing test_scope" };
  return { valid: true, fields };
}

export function isReliableTestCommand(command) {
  return Boolean(command && TEST_COMMAND.test(command) && !UNRELIABLE_COMMAND.test(command));
}

function recordPost(event, forcedFailure) {
  updateState(event, (state) => {
    if (FILE_TOOLS.test(toolName(event))) {
      state.revision += 1;
      state.mutations += 1;
      return;
    }
    const command = shellCommand(event);
    if (!command) return;
    if (SHELL_MUTATION.test(command)) {
      state.revision += 1;
      state.mutations += 1;
      return;
    }
    if (isReliableTestCommand(command) && successfulResponse(event, forcedFailure)) {
      state.testReceipt = { revision: state.revision, commandHash: digest(command.trim()), at: Date.now() };
    }
  });
}

function recordReview(event) {
  const message = extract(event, "last_assistant_message", "lastAssistantMessage", "assistant_text", "assistantText") ?? "";
  const review = parseReview(message);
  if (!review.valid) return;
  updateState(event, (state) => {
    state.reviewReceipt = { revision: state.revision, agentId: extract(event, "agent_id", "agentId") ?? null, at: Date.now() };
  });
}

function contextOutput(eventName, text) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } };
}

function stopBlock(reason) {
  return { decision: "block", reason };
}

function stopReason(findings) {
  return [
    "[SWE Contract Verifier] Final source revision lacks required independent verification.",
    "",
    ...findings.map((finding) => `- ${finding}`),
    "",
    "Recovery: run one standalone relevant test command, then delegate a fresh read-only reviewer for the current diff.",
    "The reviewer must use the bundled `swe-contract-verification` Skill and end with SWE_CONTRACT_REVIEW_V1. Fixing a finding creates a new revision, so rerun both steps afterward.",
  ].join("\n");
}

function evaluateStop(event) {
  const state = readState(event);
  if (state.mutations === 0) return null;
  const findings = [];
  if (state.testReceipt?.revision !== state.revision) findings.push("no successful standalone test receipt after the latest mutation");
  if (state.reviewReceipt?.revision !== state.revision) findings.push("no independent PASS review receipt for the latest mutation");
  if (findings.length === 0) return null;
  const active = extract(event, "stop_hook_active", "stopHookActive") === true;
  const updated = updateState(event, (current) => { current.stopBlocks += 1; return current.stopBlocks; });
  if (active && Number(updated.result) > 2) {
    process.stderr.write(`${stopReason(findings)}\n[SWE Contract Verifier] fail-open after bounded retries; state retained.\n`);
    return null;
  }
  return stopBlock(stopReason(findings));
}

export async function main(mode = process.argv[2]) {
  const event = await readEvent();
  if (event.__parseError) return;
  let output = null;
  if (mode === "session") {
    updateState(event, () => {});
    output = contextOutput("SessionStart", SESSION_CONTEXT);
  } else if (mode === "subagent-start") output = contextOutput("SubagentStart", REVIEWER_CONTEXT);
  else if (mode === "post") recordPost(event, false);
  else if (mode === "failure") recordPost(event, true);
  else if (mode === "subagent-stop") recordReview(event);
  else if (mode === "stop") output = evaluateStop(event);
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[swe-contract-verifier] hook failed open: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(0);
  });
}
