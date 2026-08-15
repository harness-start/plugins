#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig } from "../../lib/config.js";
import {
  contextOutput,
  extractAssistantMessage,
  extractCwd,
  extractFileTargets,
  extractSessionId,
  extractShellCommand,
  extractToolResponse,
  inferOutcome,
  isMutationTool,
  preToolDeny,
  readStdinJson,
  stopDeny,
  writeJson,
} from "../../lib/hook-io.js";
import { readState } from "../../lib/state-store.js";
import { commandMentionsRoot, isGenericMutationCommand } from "@harness/core/path-protect";

import {
  describeLedger,
  isLedgerManagedPath,
  isOfficialWriterCommand,
  scanLedgers,
} from "../../lib/ledger.js";
import {
  bindAfterWriter,
  classifyPath,
  closeBinding,
  completionFindings,
  configuredOutcome,
  preMutationDecision,
  recordReceipt,
  refreshBoundWorkOrder,
} from "../../lib/workflow.js";

function warn(message) { process.stderr.write(`[debugging-workflow-guard] ${message}\n`); }
function repoRoot(cwd) {
  try { return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return resolve(cwd); }
}
function shellMutates(command) {
  const withoutNullRedirects = command.replace(/(?:[0-9]*>>?|&>)\s*\/dev\/null\b/gu, "");
  return /(?:^|[;&|]\s*)(?:sed\s+(?:-[^\s]*i)|perl\s+(?:-[^\s]*i)|tee\b|cp\b|mv\b|touch\b|mkdir\b|truncate\b|git\s+(?:apply|am|merge|rebase|cherry-pick)|npm\s+(?:install|uninstall)|pnpm\s+(?:add|remove)|yarn\s+(?:add|remove))|(?:>|>>)[^&]/iu.test(withoutNullRedirects);
}
function conciseResponse(event) {
  const value = event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.error ?? "";
  return (typeof value === "string" ? value : JSON.stringify(value)).replace(/\s+/gu, " ").slice(0, 240);
}
function ensureLocalExclude(root, config) {
  if (config.ledger.persistence !== "local") return;
  try {
    const path = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8", timeout: 5000 }).trim();
    const absolute = resolve(root, path);
    const entry = `/${config.ledger.root}/`;
    const existing = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    if (!existing.split(/\r?\n/u).includes(entry)) appendFileSync(absolute, `${existing && !existing.endsWith("\n") ? "\n" : ""}${entry}\n`, "utf8");
  } catch (error) { warn(`cannot update .git/info/exclude: ${error?.message ?? error}`); }
}

async function context(event) {
  const cwd = extractCwd(event);
  const root = repoRoot(cwd);
  const config = await loadProjectConfig(root, warn);
  return { cwd, root, config, sessionId: extractSessionId(event) };
}

async function runSession(event) {
  const { root, config } = await context(event);
  if (config.mode === "off") return;
  const orders = scanLedgers(root, config);
  if (orders.length === 0) return;
  const lines = ["[Debugging Workflow Guard] Found resumable Debug Work Orders; none was activated."];
  for (const order of orders) lines.push(describeLedger(order, root));
  lines.push("Use the debug-workflow CLI to resume (`resume --id ...`). Hooks activate only after a writer command; do not Edit or Write the ledger.");
  writeJson(contextOutput("SessionStart", lines.join("\n")));
}

async function runPre(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const command = extractShellCommand(event);
  let paths = extractFileTargets(event);
  if (command && isOfficialWriterCommand(command)) {
    return;
  }
  if (command && (shellMutates(command) || isGenericMutationCommand(command)) && commandMentionsRoot(command, config.ledger.root, resolve(root, config.ledger.root))) {
    writeJson(preToolDeny("[Debugging Workflow Guard] Direct ledger mutation is denied; use the debug-workflow CLI writer."));
    return;
  }
  const ledgerWrites = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerWrites.length > 0 && isMutationTool(event)) {
    writeJson(preToolDeny("[Debugging Workflow Guard] Direct file-tool writes to a live ledger are denied; use the debug-workflow CLI writer."));
    return;
  }
  if (command && shellMutates(command)) paths = [resolve(root, "__unknown_shell_mutation__")];
  if (paths.length === 0) return;
  const decision = preMutationDecision({ cwd, sessionId, paths, config });
  if (decision.action === "block") writeJson(preToolDeny(`[Debugging Workflow Guard] ${decision.reason}`));
  else if (decision.action === "report") writeJson(contextOutput("PreToolUse", `[Debugging Workflow Guard] ${decision.reason}`));
}

function responseStdout(event) {
  const response = extractToolResponse(event);
  if (typeof response === "string") return response;
  if (response && typeof response === "object" && typeof response.stdout === "string") return response.stdout;
  return conciseResponse(event);
}

async function runPost(event, forceFailure = false) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const postEvent = forceFailure ? "PostToolUseFailure" : "PostToolUse";
  const paths = extractFileTargets(event);
  const command = extractShellCommand(event);
  if (command) {
    const bound = bindAfterWriter({ cwd, sessionId, command, stdout: responseStdout(event), config });
    if (bound.kind !== "idle") {
      if (bound.kind === "bound") {
        ensureLocalExclude(root, config);
        writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Bound ${bound.workOrder.id} at ${relative(root, bound.state.workOrderPath)}; state ${bound.workOrder.status}/${bound.workOrder.run.state}; active bug ${bound.workOrder.activeBugId ?? "none"}.${bound.active ? " Evidence and mutations are now attributed to that bug." : " No active mutation guard remains."}`));
        closeBinding({ cwd, sessionId, config });
      } else if (["invalid", "conflict"].includes(bound.kind)) {
        writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order activation rejected: ${(bound.findings ?? []).join("; ")}`));
      } else if (["active", "inactive"].includes(bound.kind)) {
        writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Work Order ${bound.workOrder.id} refreshed; state ${bound.workOrder.status}/${bound.workOrder.run.state}; active bug ${bound.workOrder.activeBugId ?? "none"}.`));
        closeBinding({ cwd, sessionId, config });
      }
      return;
    }
  }
  const ledgerTouches = paths.filter((path) => isLedgerManagedPath(path, root, config));
  if (ledgerTouches.length > 0) {
    const before = readState(sessionId, root);
    if (forceFailure && !before.bound && ledgerTouches.every((path) => !existsSync(path))) {
      writeJson(contextOutput(postEvent, "[Debugging Workflow Guard] Work Order write failed before a file existed; workflow was not activated. Use the debug-workflow CLI writer."));
      return;
    }
    writeJson(contextOutput(postEvent, "[Debugging Workflow Guard] Direct ledger writes do not activate the workflow; use the debug-workflow CLI writer."));
    return;
  }

  if (command) {
    const outcome = configuredOutcome(command, inferOutcome(event, forceFailure), config);
    const recorded = recordReceipt({ cwd, sessionId, config, kind: shellMutates(command) ? "mutation" : "command", command, outcome, summary: conciseResponse(event) });
    if (recorded.kind === "recorded") writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: ${recorded.receipt.kind} ${recorded.receipt.outcome} for ${recorded.receipt.bugId}. Cite this id only when it supports the stated claim.`));
    if (recorded.kind === "recorded" && recorded.receipt.kind === "reproduction" && outcome === "failure") {
      const count = recorded.state.attempts[recorded.receipt.bugId] ?? 0;
      if (count >= config.limits.maxFailedFixAttempts) writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] ${recorded.receipt.bugId} reached ${count} failed post-mutation reproductions. Move only this bug to architecture-review before another production edit.`));
    }
    return;
  }
  if (isMutationTool(event) && paths.length > 0) {
    const live = refreshBoundWorkOrder({ cwd, sessionId, config });
    if (live.kind !== "active") return;
    const codePaths = paths.filter((path) => classifyPath(path, root, config) === "code");
    if (codePaths.length > 0) {
      const recorded = recordReceipt({ cwd, sessionId, config, kind: "mutation", paths: codePaths, outcome: "success", summary: `${codePaths.length} production path(s) changed` });
      if (recorded.kind === "recorded") writeJson(contextOutput(postEvent, `[Debugging Workflow Guard] Receipt ${recorded.receipt.id}: production mutation attributed to ${recorded.receipt.bugId}.`));
    }
  }
}

async function runStop(event) {
  const { cwd, root, config, sessionId } = await context(event);
  if (config.mode === "off") return;
  const live = refreshBoundWorkOrder({ cwd, sessionId, config });
  if (live.kind === "idle") return;
  if (!["active", "inactive"].includes(live.kind)) {
    const reason = `[Debugging Workflow Guard] Bound Work Order is invalid: ${(live.findings ?? []).join("; ")}`;
    if (config.mode === "block") writeJson(stopDeny(reason)); else writeJson(contextOutput("Stop", reason));
    return;
  }
  const message = extractAssistantMessage(event);
  const rel = relative(root, live.state.workOrderPath).replaceAll("\\", "/");
  const findings = live.workOrder.status === "closed" ? completionFindings(live) : [];
  if (live.workOrder.status === "closed") {
    const marker = `DBG_${live.workOrder.id.replace(/[^A-Za-z0-9]+/gu, "_")}`;
    try {
      const matches = execFileSync("git", ["grep", "--untracked", "-n", "-I", "-e", marker, "--", ".", `:!${config.ledger.root}`], { cwd: root, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (matches) findings.push(`debug instrumentation remains under marker prefix ${marker}`);
    } catch (error) {
      if (![1, "1"].includes(error?.status)) findings.push("debug-marker cleanup scan could not complete");
    }
  }
  if (["closed", "paused", "aborted"].includes(live.workOrder.status) && !message.includes(rel) && !message.includes(live.workOrder.id)) {
    findings.push(`response must reference ${rel} or ${live.workOrder.id}`);
  }
  if (findings.length === 0) { closeBinding({ cwd, sessionId, config }); return; }
  const reason = `[Debugging Workflow Guard] Debug workflow cannot stop:\n- ${findings.join("\n- ")}\nUse the debug-workflow CLI to update the ledger; do not invent receipt ids.`;
  if (config.mode === "block") writeJson(stopDeny(reason)); else writeJson(contextOutput("Stop", reason));
}

export async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  try {
    if (mode === "session") await runSession(event);
    else if (mode === "pre") await runPre(event);
    else if (mode === "post") await runPost(event, false);
    else if (mode === "failure") await runPost(event, true);
    else if (mode === "stop") await runStop(event);
    else { warn(`unknown mode: ${mode}`); process.exitCode = 2; }
  } catch (error) {
    warn(error?.stack ?? error);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
