#!/usr/bin/env node

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./lib/config.mjs";
import {
  additionalContextOutput,
  extractAssistantMessage,
  extractCwd,
  extractShellCommand,
  isFileTool,
  isStopHookActive,
  readStdinJson,
  responseFailed,
  responseTexts,
  stopBlock,
  writeJson,
} from "./lib/hook-io.mjs";
import { inspectProjectInstructions, resolveProjectRootOrNull } from "./lib/project-instructions.mjs";
import { clearState, readState, updateState } from "./lib/state-store.mjs";

const CLI_PATH = fileURLToPath(new URL("./project-instructions-cli.mjs", import.meta.url));
const READ_ONLY = /^\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)\s+)*(?:pwd|ls|cat|head|tail|wc|stat|sha(?:1|256|512)sum|shasum|find|grep|rg|which|git(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))?\s+(?:status|diff|log|show|rev-parse|branch|ls-files))\b/iu;
const SHELL_WRITE_OR_SUBSTITUTION = /[<>`]|\$\(/u;
const BLOCKED_STATUS = /(?:^|\n)\s*(?:BLOCKED|NEEDS_CONTEXT)\s*(?:\n|$)/u;

function warn(message) {
  process.stderr.write(`[project-instruction-guard] ${message}\n`);
}

function isReadOnlyCommand(command) {
  const value = String(command ?? "");
  if (SHELL_WRITE_OR_SUBSTITUTION.test(value)) return false;
  const segments = value.split(/&&|\|\||;|\n|(?<!\|)\|(?!\|)/u).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 && segments.every((segment) => READ_ONLY.test(segment));
}

function cliInvocation(command) {
  const value = String(command ?? "");
  if (/`|\$\(/u.test(value)) return null;
  const match = value.match(/^\s*(?:(?:AI_EXPERTS_SESSION_ID|AI_EXPERTS_TRIGGER_FROM)=(?:"[^"]*"|'[^']*'|[^\s;&|<>`]+)\s+)*node\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s+(inspect|reconcile|verify|rollback)((?:\s+--[a-z][a-z-]*\s+(?:"[^"]*"|'[^']*'|[^\s;&|<>`]+))*)\s*$/iu);
  if (!match) return null;
  const path = resolve(match[1] ?? match[2] ?? match[3]);
  return path === resolve(CLI_PATH) ? { action: match[4] } : null;
}

function parseReceipt(event) {
  for (const text of responseTexts(event)) {
    const candidates = [text.trim(), ...text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).reverse()];
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(candidate);
        if (value?.schema === "project-instruction-receipt/v1") return value;
      } catch {}
    }
  }
  return null;
}

function receiptDigest(receipt) {
  return createHash("sha256")
    .update(JSON.stringify({
      toolId: receipt.toolId,
      invocationId: receipt.invocationId,
      observedAt: receipt.observedAt,
      provenance: receipt.provenance,
      result: receipt.result,
    }))
    .digest("hex");
}

function validCommonReceipt(receipt, state, toolId) {
  if (!receipt || receipt.toolId !== toolId || receipt.ok !== true) return false;
  if (typeof receipt.invocationId !== "string" || receipt.invocationId.length < 8) return false;
  if (receipt.provenance?.sessionPresent !== true) return false;
  if (receipt.result?.state?.root !== state.root) return false;
  if (receipt.observationDigest !== receiptDigest(receipt)) return false;
  const observedAt = Date.parse(receipt.observedAt);
  if (!Number.isFinite(observedAt) || Math.abs(Date.now() - observedAt) > 5 * 60 * 1000) return false;
  return true;
}

function validMutationReceipt(receipt, state, action) {
  const toolId = action === "rollback" ? "project-instructions-rollback" : "project-instructions-reconcile";
  return validCommonReceipt(receipt, state, toolId)
    && receipt.result?.changed === true
    && receipt.result?.afterDigest === state.stateDigest
    && receipt.result?.state?.stateDigest === state.stateDigest
    && typeof receipt.result?.revisionId === "string"
    && receipt.result.revisionId !== "none";
}

function validVerifierReceipt(receipt, instructionState, state) {
  if (!validCommonReceipt(receipt, instructionState, "project-instructions-verify")) return false;
  if (receipt.result?.ok !== true || receipt.result?.stateDigest !== instructionState.stateDigest) return false;
  if (receipt.result.decision === "no-change") return state.guardMutationInvocationId === null;
  if (!["changed", "rollback"].includes(receipt.result.decision)) return false;
  return receipt.provenance?.verifiesInvocationId === state.guardMutationInvocationId
    && receipt.result?.revisionId === state.guardMutationRevisionId;
}

function noteMutation(event, root, guardReceipt = null) {
  return updateState(event, root, (state) => {
    const shouldReport = !state.reminderPending;
    state.mutationRevision += 1;
    state.reminderPending = true;
    state.stopBlocks = 0;
    state.guardMutationInvocationId = guardReceipt?.invocationId ?? null;
    state.guardMutationRevisionId = guardReceipt?.result?.revisionId ?? null;
    return shouldReport;
  }).result;
}

function recordVerification(event, root, instructionState, receipt) {
  updateState(event, root, (state) => {
    state.verifiedRevision = state.mutationRevision;
    state.verifiedStateDigest = instructionState.stateDigest;
    state.verifiedAt = receipt.observedAt;
    state.reminderPending = false;
    state.stopBlocks = 0;
    state.guardMutationInvocationId = null;
    state.guardMutationRevisionId = null;
  });
}

async function context(event, root) {
  const { config } = await loadConfig(root, warn);
  if (config.mode === "off") return;
  const state = inspectProjectInstructions(root);
  if (state.valid) return;
  const target = state.instructionSource === "README.md"
    ? "维护 README.md 受管区并保留 AGENTS.md/CLAUDE.md → README.md"
    : "维护 AGENTS.md 并建立 CLAUDE.md → AGENTS.md";
  writeJson(additionalContextOutput([
    "[Project Instruction Guard] Git 根项目指令结构需要维护。",
    `root=${state.root}`,
    `instructionSource=${state.instructionSource}`,
    `stateDigest=${state.stateDigest}`,
    ...state.findings.map((finding) => `- ${finding}`),
    `${target}。使用 project-instruction-maintenance Skill 执行 inspect → reconcile → verify。`,
  ].join("\n")));
}

async function post(event, root) {
  const { config } = await loadConfig(root, warn);
  if (config.mode === "off" || responseFailed(event)) return;
  const command = extractShellCommand(event);
  if (command !== null) {
    const invocation = cliInvocation(command);
    if (invocation?.action === "verify") {
      const instructionState = inspectProjectInstructions(root);
      const receipt = parseReceipt(event);
      const state = readState(event, root);
      if (validVerifierReceipt(receipt, instructionState, state)) recordVerification(event, root, instructionState, receipt);
      else warn("ignored an invalid or mismatched project-instructions-verify receipt");
      return;
    }
    if (invocation?.action === "inspect") return;
    if (invocation?.action === "reconcile" || invocation?.action === "rollback") {
      const instructionState = inspectProjectInstructions(root);
      const receipt = parseReceipt(event);
      if (receipt?.result?.changed === false && validCommonReceipt(
        receipt,
        instructionState,
        "project-instructions-reconcile",
      )) return;
      const validReceipt = validMutationReceipt(receipt, instructionState, invocation.action);
      if (!validReceipt) warn(`could not authenticate the ${invocation.action} receipt; retaining a conservative dirty state`);
      noteMutation(event, root, validReceipt ? receipt : null);
      return;
    }
    if (isReadOnlyCommand(command)) return;
    if (noteMutation(event, root)) {
      warn("project files changed; assess the managed instruction block and run project-instructions-verify last");
    }
    return;
  }
  if (isFileTool(event) && noteMutation(event, root)) {
    warn("project files changed; assess the managed instruction block and run project-instructions-verify last");
  }
}

function recoveryReason(state, freshness) {
  if (!state.valid) {
    return [
      "[Project Instruction Guard] Git 根项目指令结构未闭合，不能报告完成。",
      `instructionSource=${state.instructionSource}`,
      `stateDigest=${state.stateDigest}`,
      ...state.findings.map((finding) => `- ${finding}`),
      "",
      "恢复方式：使用 `project-instruction-maintenance` Skill，以当前 stateDigest 执行 reconcile；写入后用 revisionId 执行 verify。",
      "只有规则冲突、异常 symlink 或平台无法创建 symlink 时才需要用户决定。",
    ].join("\n");
  }
  return [
    "[Project Instruction Guard] 本轮项目文件已变化，但最后一次变化之后没有匹配当前状态的 project-instructions-verify receipt。",
    `mutationRevision=${freshness.mutationRevision}`,
    `verifiedRevision=${freshness.verifiedRevision}`,
    `stateDigest=${state.stateDigest}`,
    "",
    "恢复方式：判断受管区是否需要 reconcile；无变化也运行 verify --decision no-change，并把 verify 作为最后一个变更相关命令。",
  ].join("\n");
}

async function stop(event, root) {
  const { config } = await loadConfig(root, warn);
  if (config.mode === "off") return;
  const message = extractAssistantMessage(event);
  if (BLOCKED_STATUS.test(message)) return;
  if (isStopHookActive(event)) {
    warn("Stop retry is already active; retained project-instruction state without recursively blocking");
    return;
  }
  const instructionState = inspectProjectInstructions(root);
  const state = readState(event, root);
  const fresh = state.mutationRevision === state.verifiedRevision
    && state.verifiedStateDigest === instructionState.stateDigest;
  if (instructionState.valid && (state.mutationRevision === 0 || fresh)) {
    clearState(event, root);
    return;
  }
  const reason = recoveryReason(instructionState, state);
  updateState(event, root, (current) => { current.stopBlocks += 1; });
  if (config.mode === "report") {
    warn(reason);
    return;
  }
  writeJson(stopBlock(reason));
  process.stderr.write(`${reason}\n`);
}

export async function main(mode = process.argv[2]) {
  const event = await readStdinJson();
  if (event.__parseError || !["session", "post", "stop"].includes(mode)) return;
  const root = resolveProjectRootOrNull(extractCwd(event));
  if (!root) return;
  if (mode === "session") await context(event, root);
  else if (mode === "post") await post(event, root);
  else await stop(event, root);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 0;
  });
}
