#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextOutput,
  extractAssistantMessage,
  extractCwd,
  extractPrompt,
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
import { sha256, verifyReport } from "../../lib/report-integrity.js";
import { reportPath } from "../../lib/report-store.js";
import { readReportCandidate } from "../../lib/report-candidate.js";
import { createAcknowledgement, parseAcknowledgement, validateAcknowledgement } from "../../lib/report-contract.js";

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

async function prepareState(event: HookEvent, official: OfficialCommandOk, env: NodeJS.ProcessEnv): Promise<string> {
  const state = await readState(event, env);
  const cwd = extractCwd(event);
  const candidate = await readReportCandidate(official.args, cwd);
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
  const acknowledgement = candidate.contract && candidate.evidence
    ? createAcknowledgement(candidate.contract, candidate.evidence)
    : null;
  await writeState(event, {
    ...state,
    phase: "prepared",
    kind: official.kind === "report" ? state.kind : official.kind,
    candidateSha256: sha256(candidate.body),
    candidatePath: candidate.candidatePath,
    evidencePath: candidate.evidencePath,
    contractDigest: acknowledgement?.contractDigest ?? null,
    evidenceDigest: acknowledgement?.evidenceDigest ?? null,
    ackToken: acknowledgement?.token ?? null,
    acknowledgementDigest: null,
    lastError: null,
    reportSha256,
    target,
    operation: official.action === "prepare" ? "save" : "append",
  }, env);
  if (!acknowledgement || !candidate.contract) return "Candidate digest recorded. Present the complete content and wait for explicit confirmation.";
  const dispositions = candidate.contract.employeeDispositions.map((item) => `${item.findingId}=${item.status}${item.status === "accepted" ? "" : `:${item.reason ?? "reason"}`}`);
  const commitments = candidate.contract.commitments.map((item) => `commit=${item.id}`);
  return `V2 candidate prepared. Require this exact acknowledgement after showing the full report:\n# work-report-ack ${acknowledgement.token} | ${[...dispositions, ...commitments].join(" | ")}`;
}

async function runPre(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  const state = await readState(event, env);
  const command = isShellTool(event) ? extractShellCommand(event) : null;
  const official = parseOfficialCommand(command);
  const trusted = Boolean(official && !hasOfficialError(official) && await officialScriptTrusted(official, { cwd: extractCwd(event) }));
  if (trusted && official && !hasOfficialError(official) && (official.action === "prepare" || official.action === "addition-prepare")) {
    try {
      const message = await prepareState(event, official, env);
      writeJson(contextOutput("PreToolUse", `[Work Report Insights] ${message}`));
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
  if (toolReportedFailure(event) || (state.phase !== "prepared" && state.phase !== "acknowledged") || state.operation !== official.action) return;
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
    if (official.action === "save" && state.contractDigest) {
      const ledger = JSON.parse(await readFile(`${target}.ledger.json`, "utf8")) as Record<string, unknown>;
      if (ledger.schema !== "WorkReportLedgerV2" || ledger.reportDigest !== checked.digest || ledger.contractDigest !== state.contractDigest || ledger.evidenceDigest !== state.evidenceDigest) return;
    }
    await writeState(event, { ...state, phase: "sealed", target, candidateSha256: null, candidatePath: null, operation: null }, env);
    writeJson(contextOutput("PostToolUse", `[Work Report Insights] Sealed report verified: ${target}\nSHA-256: ${checked.digest}`));
  } catch {
    // A failed tool remains observable through its own response; do not forge a receipt.
  }
}

function reportIntent(prompt: string): boolean {
  return /(?:\u5199|\u751f\u6210|\u6574\u7406|\u590d\u76d8|\u603b\u7ed3|create|write|review|summari[sz]e).{0,16}(?:\u65e5\u62a5|\u5468\u62a5|\u5de5\u4f5c\u603b\u7ed3|\u9636\u6bb5\u603b\u7ed3|\u5de5\u4f5c\u590d\u76d8|work\s+report|weekly\s+report|daily\s+report)|(?:\u65e5\u62a5|\u5468\u62a5|\u5de5\u4f5c\u603b\u7ed3|\u9636\u6bb5\u603b\u7ed3|\u5de5\u4f5c\u590d\u76d8).{0,16}(?:\u5199|\u751f\u6210|\u6574\u7406|\u590d\u76d8|\u603b\u7ed3)/iu.test(prompt);
}

async function runPrompt(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  const prompt = extractPrompt(event).trim();
  const state = await readState(event, env);
  if (prompt.startsWith("# work-report-ack")) {
    if (state.phase !== "prepared" || !state.ackToken || !state.candidatePath || !state.evidencePath) {
      writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] Acknowledgement rejected: no matching prepared V2 report."));
      return;
    }
    try {
      const candidate = await readReportCandidate({ contract: state.candidatePath, evidence: state.evidencePath });
      if (!candidate.contract || !candidate.evidence) throw new Error("prepared V2 inputs are unavailable");
      const current = createAcknowledgement(candidate.contract, candidate.evidence, "digest-check");
      if (current.contractDigest !== state.contractDigest || current.evidenceDigest !== state.evidenceDigest) throw new Error("contract or evidence changed after prepare");
      const parsed = parseAcknowledgement(prompt);
      const checked = validateAcknowledgement(parsed, { token: state.ackToken, contractDigest: state.contractDigest, evidenceDigest: state.evidenceDigest }, candidate.contract);
      if (!checked.ok) throw new Error(checked.errors.join("; "));
      await writeState(event, { ...state, phase: "acknowledged", acknowledgementDigest: sha256(JSON.stringify(parsed)), lastError: null }, env);
      writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] Employee acknowledgement recorded; the prepared V2 candidate may now be saved."));
    } catch (error) {
      writeJson(contextOutput("UserPromptSubmit", `[Work Report Insights] Acknowledgement rejected: ${errorMessage(error)}`));
    }
    return;
  }
  if (!reportIntent(prompt)) return;
  await writeState(event, { ...state, phase: state.phase === "idle" ? "routed" : state.phase }, env);
  writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] Route this request through `$work-report-authoring`. Select the period, collect EvidenceBundleV2, build WorkReportContractV2, obtain exact employee acknowledgement, then save."));
}

async function runSession(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  const state = await readState(event, env);
  if (state.phase === "idle" || state.phase === "sealed") return;
  writeJson(contextOutput("SessionStart", `[Work Report Insights] Resume unfinished work-report workflow at phase: ${state.phase}.`));
}

async function runFailure(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  if (!isShellTool(event)) return;
  const official = parseOfficialCommand(extractShellCommand(event));
  if (!official || hasOfficialError(official)) return;
  const state = await readState(event, env);
  await writeState(event, { ...state, lastError: `official ${official.action} failed; inspect the tool error and retry from ${state.phase}` }, env);
  writeJson(contextOutput("PostToolUseFailure", `[Work Report Insights] Official ${official.action} failed. State remains ${state.phase}; fix the reported cause and retry the same stage.`));
}

async function runStop(event: HookEvent, env: NodeJS.ProcessEnv): Promise<void> {
  if (event.stop_hook_active === true) return;
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
    if (mode === "prompt" || mode === "UserPromptSubmit") await runPrompt(event, env);
    else if (mode === "session" || mode === "SessionStart") await runSession(event, env);
    else if (mode === "pre" || mode === "PreToolUse") await runPre(event, env);
    else if (mode === "post" || mode === "PostToolUse") await runPost(event, env);
    else if (mode === "failure" || mode === "PostToolUseFailure") await runFailure(event, env);
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

export { runFailure, runPost, runPre, runPrompt, runSession, runStop };
