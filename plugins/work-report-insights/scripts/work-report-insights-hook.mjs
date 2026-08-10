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
} from "./lib/hook-io.mjs";
import {
  detectReportIntent,
  isConfirmation,
  officialScriptTrusted,
  parseOfficialCommand,
  protectionDecision,
} from "./lib/hook-policy.mjs";
import { emptyState, readState, updateState, writeState } from "./lib/hook-state.mjs";
import { SEAL_PREFIX, sha256, verifyReport } from "./lib/report-integrity.mjs";
import { reportPath } from "./lib/report-store.mjs";

function home(env) {
  return resolve(env.HOME || homedir());
}

function routeContext(kind) {
  const skill = kind === "daily" ? "$daily-work-report" : kind === "weekly" ? "$weekly-work-report" : "$work-summary-report";
  const limit = kind === "daily" ? 3 : 5;
  return [
    `[Work Report Insights] Route this request to ${skill}.`,
    "Collect transcript evidence from both hosts without reading Git.",
    `Invoke $grill-me and ask one evidence-backed question per turn, up to ${limit} questions; if unavailable, follow the same one-question fallback locally.`,
    "Show the complete draft, run the matching prepare command, and wait for explicit user confirmation before save.",
    "Never write directly under ~/.ai-experts/*-reports/*.",
  ].join("\n");
}

async function runPrompt(event, env) {
  const prompt = extractPrompt(event);
  const state = await readState(event, env);
  const kind = detectReportIntent(prompt);
  if (kind) {
    await writeState(event, { ...emptyState(), phase: "armed", kind }, env);
    writeJson(contextOutput("UserPromptSubmit", routeContext(kind)));
    return;
  }
  if (state.phase === "prepared" && isConfirmation(prompt)) {
    await writeState(event, { ...state, phase: "confirmed" }, env);
    writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] The prepared candidate is confirmed. Save exactly the bound bytes with the matching official command."));
    return;
  }
  if (state.phase === "prepared") {
    await writeState(event, { ...state, phase: "interviewing", candidateSha256: null, candidatePath: null, target: null, operation: null }, env);
    writeJson(contextOutput("UserPromptSubmit", "[Work Report Insights] The user changed or supplemented the draft. Incorporate the answer, regenerate the complete draft, and run prepare again."));
    return;
  }
  if (new Set(["armed", "evidence-collected", "interviewing"]).has(state.phase)) {
    const limit = state.kind === "daily" ? 3 : 5;
    await writeState(event, { ...state, phase: "interviewing", answerCount: Math.min(limit, Number(state.answerCount || 0) + 1) }, env);
  }
}

async function prepareState(event, official, env) {
  const state = await readState(event, env);
  if (state.phase === "idle") throw new Error("start a report workflow before preparing content");
  const cwd = extractCwd(event);
  const candidatePath = resolve(cwd, official.args.input);
  let candidate = await readFile(candidatePath, "utf8");
  if (!candidate.trim()) throw new Error("candidate content is empty");
  if (candidate.includes(SEAL_PREFIX)) throw new Error("candidate contains a reserved seal marker");
  if (!candidate.endsWith("\n")) candidate += "\n";
  const target = official.action === "prepare"
    ? reportPath({ kind: official.kind, ...official.args, home: home(env) })
    : resolve(cwd, official.args.report);
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

async function runPre(event, env) {
  const state = await readState(event, env);
  const command = isShellTool(event) ? extractShellCommand(event) : null;
  const official = parseOfficialCommand(command);
  const trusted = official && !official.error && await officialScriptTrusted(official, { cwd: extractCwd(event) });
  if (trusted && new Set(["prepare", "addition-prepare"]).has(official.action)) {
    try {
      await prepareState(event, official, env);
      writeJson(contextOutput("PreToolUse", "[Work Report Insights] Candidate digest recorded. Present the complete content and wait for explicit confirmation."));
    } catch (error) {
      writeJson(preToolDeny(`[Work Report Insights] Prepare denied: ${error?.message ?? String(error)}`));
    }
    return;
  }
  const decision = await protectionDecision(event, { home: home(env), state });
  if (decision.deny) writeJson(preToolDeny(decision.reason));
}

async function runPost(event, env) {
  if (!isShellTool(event)) return;
  const official = parseOfficialCommand(extractShellCommand(event));
  if (!official || official.error) return;
  const state = await readState(event, env);
  if (new Set(["collect", "scan"]).has(official.action) && state.phase !== "idle") {
    await writeState(event, { ...state, phase: "evidence-collected" }, env);
    return;
  }
  if (!new Set(["save", "append"]).has(official.action)) return;
  if (toolReportedFailure(event) || state.phase !== "confirmed" || state.operation !== official.action) return;
  try {
    const target = official.action === "save"
      ? reportPath({ kind: official.kind, ...official.args, home: home(env) })
      : resolve(extractCwd(event), official.args.report);
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

async function runStop(event, env) {
  const state = await readState(event, env);
  if (state.phase === "idle" || state.phase === "sealed") return;
  const message = extractAssistantMessage(event);
  if (/(?:\u62a5\u544a|\u65e5\u62a5|\u5468\u62a5|\u603b\u7ed3).{0,12}(?:\u5df2\u4fdd\u5b58|\u5df2\u5199\u5165|\u5df2\u751f\u6210|\u5b8c\u6210)|(?:saved|wrote|generated).{0,16}report/iu.test(message)) {
    writeJson(stopDeny("[Work Report Insights] A report completion claim requires a successful save and a verified SHA-256 seal. Continue the interview or complete prepare → confirmation → save."));
  }
}

async function main() {
  const mode = process.argv[2] ?? "prompt";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const env = process.env;
  try {
    if (new Set(["prompt", "UserPromptSubmit"]).has(mode)) await runPrompt(event, env);
    else if (new Set(["pre", "PreToolUse"]).has(mode)) await runPre(event, env);
    else if (new Set(["post", "PostToolUse"]).has(mode)) await runPost(event, env);
    else if (new Set(["stop", "Stop"]).has(mode)) await runStop(event, env);
  } catch (error) {
    if (new Set(["pre", "PreToolUse"]).has(mode)) {
      writeJson(preToolDeny(`[Work Report Insights] Protection check failed closed: ${error?.message ?? String(error)}`));
    } else {
      process.stderr.write(`[work-report-insights] ${error?.message ?? String(error)}\n`);
    }
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

export { runPost, runPre, runPrompt, runStop };
