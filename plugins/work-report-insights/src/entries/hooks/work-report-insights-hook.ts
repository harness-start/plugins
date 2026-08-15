#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextOutput,
  extractAssistantMessage,
  extractCwd,
  extractShellCommand,
  isShellTool,
  preToolDeny,
  readStdinJson,
  stopDeny,
  toolReportedFailure,
  writeJson,
} from "../../lib/hook-io.js";
import { isRecord, type HookEvent } from "@harness/core/hook-event";

import {
  hasOfficialError,
  officialScriptTrusted,
  parseOfficialCommand,
  protectionDecision,
  type OfficialCommandOk,
} from "../../lib/hook-policy.js";
import { readState, writeState } from "../../lib/hook-state.js";
import { SEAL_PREFIX, sha256, verifyReport } from "../../lib/report-integrity.js";
import { reportPath } from "../../lib/report-store.js";

function home(env: NodeJS.ProcessEnv): string {
  return resolve(env.HOME || homedir());
}

function errorMessage(error: unknown): string {
  return isRecord(error) && error.message != null ? String(error.message) : String(error);
}

function requiredArg(value: string | undefined, flag: string): string {
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

async function prepareState(event: HookEvent, official: OfficialCommandOk, env: NodeJS.ProcessEnv): Promise<void> {
  const state = await readState(event, env);
  const cwd = extractCwd(event);
  const candidatePath = resolve(cwd, requiredArg(official.args.input, "--input"));
  let candidate = await readFile(candidatePath, "utf8");
  if (!candidate.trim()) throw new Error("candidate content is empty");
  if (candidate.includes(SEAL_PREFIX)) throw new Error("candidate contains a reserved seal marker");
  if (!candidate.endsWith("\n")) candidate += "\n";
  const target = official.action === "prepare"
    ? reportPath({ kind: official.kind, ...official.args, home: home(env) })
    : resolve(cwd, requiredArg(official.args.report, "--report"));
  let reportSha256 = null;
  if (official.action === "addition-prepare") {
    const report = await readFile(target, "utf8");
    const checked = verifyReport(report);
    if (!checked.ok) throw new Error(`report cannot be appended: ${checked.reason}`);
    reportSha256 = sha256(report);
  }
  await writeState(event, {
    ...state,
    phase: "prepared",
    kind: official.kind === "report" ? state.kind : official.kind,
    candidateSha256: sha256(candidate),
    candidatePath,
    reportSha256,
    target,
    operation: official.action === "prepare" ? "save" : "append",
  }, env);
}

async function runPre(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  const state = await readState(event, env);
  const command = isShellTool(event) ? extractShellCommand(event) : null;
  const official = parseOfficialCommand(command);
  const trusted = Boolean(official && !hasOfficialError(official) && await officialScriptTrusted(official, { cwd: extractCwd(event) }));
  if (trusted && official && !hasOfficialError(official) && (official.action === "prepare" || official.action === "addition-prepare")) {
    try {
      await prepareState(event, official, env);
      writeJson(contextOutput("PreToolUse", "[Work Report Insights] Candidate digest recorded. Present the complete content and wait for explicit confirmation."));
    } catch (error) {
      writeJson(preToolDeny(`[Work Report Insights] Prepare denied: ${errorMessage(error)}`));
    }
    return;
  }
  const decision = await protectionDecision(event, { home: home(env), state });
  if (decision.deny) writeJson(preToolDeny(decision.reason));
}

async function runPost(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  if (!isShellTool(event)) return;
  const official = parseOfficialCommand(extractShellCommand(event));
  if (!official || hasOfficialError(official)) return;
  const state = await readState(event, env);
  if (official.action === "collect" || official.action === "scan") {
    await writeState(event, { ...state, phase: "evidence-collected", kind: official.kind === "report" ? state.kind : official.kind }, env);
    return;
  }
  if (official.action !== "save" && official.action !== "append") return;
  if (toolReportedFailure(event) || state.phase !== "prepared" || state.operation !== official.action) return;
  try {
    const target = official.action === "save"
      ? reportPath({ kind: official.kind, ...official.args, home: home(env) })
      : resolve(extractCwd(event), requiredArg(official.args.report, "--report"));
    if (target !== state.target) return;
    const content = await readFile(target, "utf8");
    const checked = verifyReport(content);
    if (!checked.ok) return;
    if (official.action === "save" && checked.digest !== state.candidateSha256) return;
    if (official.action === "append" && sha256(content) === state.reportSha256) return;
    await writeState(event, { ...state, phase: "sealed", target, candidateSha256: null, candidatePath: null, operation: null }, env);
    writeJson(contextOutput("PostToolUse", `[Work Report Insights] Sealed report verified: ${target}\nSHA-256: ${checked.digest}`));
  } catch {
    // A failed tool remains observable through its own response; do not forge a receipt.
  }
}

async function runStop(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  const state = await readState(event, env);
  if (state.phase === "idle" || state.phase === "sealed") return;
  const message = extractAssistantMessage(event);
  if (/(?:\u62a5\u544a|\u65e5\u62a5|\u5468\u62a5|\u603b\u7ed3).{0,12}(?:\u5df2\u4fdd\u5b58|\u5df2\u5199\u5165|\u5df2\u751f\u6210|\u5b8c\u6210)|(?:saved|wrote|generated).{0,16}report/iu.test(message)) {
    writeJson(stopDeny("[Work Report Insights] A report completion claim requires a successful save and a verified SHA-256 seal. Continue the interview or complete prepare → confirmation → save."));
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "pre";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const env = process.env;
  try {
    if (mode === "prompt" || mode === "UserPromptSubmit") return;
    else if (mode === "pre" || mode === "PreToolUse") await runPre(event, env);
    else if (mode === "post" || mode === "PostToolUse") await runPost(event, env);
    else if (mode === "stop" || mode === "Stop") await runStop(event, env);
  } catch (error) {
    if (mode === "pre" || mode === "PreToolUse") {
      writeJson(preToolDeny(`[Work Report Insights] Protection check failed closed: ${errorMessage(error)}`));
    } else {
      process.stderr.write(`[work-report-insights] ${errorMessage(error)}\n`);
    }
  }
}

const entry = process.argv[1];
const isMain = Boolean(entry && resolve(entry) === fileURLToPath(import.meta.url));
if (isMain) await main();

export { runPost, runPre, runStop };
