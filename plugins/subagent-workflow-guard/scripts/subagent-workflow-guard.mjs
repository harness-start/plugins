#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./lib/workflow-config.mjs";
import {
  additionalContext,
  extractAgentId,
  extractAgentPrompt,
  extractAgentType,
  extractAssistantMessage,
  extractCwd,
  extractFileTargets,
  extractParentAgentId,
  extractPrompt,
  extractSessionId,
  extractShellCommand,
  extractToolUseId,
  isAgentTool,
  isFileTool,
  isShellTool,
  preToolDeny,
  readStdinJson,
  stopDeny,
  writeJson,
} from "./lib/workflow-io.mjs";
import {
  formatApplicationContext,
  parseApplicationMarker,
  targetWithinScope,
  validateResultCard,
} from "./lib/workflow-policy.mjs";
import {
  readMailboxApplication,
  readMailboxClose,
  readMailboxRun,
  removeMailboxClose,
  writeMailboxRun,
} from "./lib/workflow-mailbox.mjs";
import { closeRun, stageApplication } from "./lib/workflow-run.mjs";
import { readState, updateState, writeApplicationArtifact } from "./lib/workflow-state.mjs";

const SESSION_CONTEXT = [
  "[Subagent Workflow Guard] Application-first dispatch is enabled.",
  "Before a governed subagent dispatch, use `subagent-handoff` to register a scoped application and include its `SUBAGENT_APPLICATION <id> <nonce>` marker in the Agent prompt.",
  "Every governed subagent must return a Result Card with Answer, Evidence, Files/commands inspected, Verification, Assumptions, Gaps, and Parent action needed.",
].join("\n");

const ORDINARY_CONTEXT = [
  "[Subagent Contract] Stay within the parent task, avoid unrelated edits, and do not dispatch another subagent.",
  "Return concise evidence and verification. A registered workflow application is required when a governed run is active.",
].join("\n");

function warn(message) {
  process.stderr.write(`[subagent-workflow-guard] ${message}\n`);
}

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function persistClaudeSession(context) {
  const environmentFile = process.env.CLAUDE_ENV_FILE;
  if (!environmentFile) return;
  const lines = [
    `export AI_EXPERTS_SESSION_ID=${shellSingleQuote(context.sessionId)}`,
    `export SUBAGENT_WORKFLOW_GUARD_HOST='claude'`,
  ];
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    lines.push(`export SUBAGENT_WORKFLOW_GUARD_ROOT=${shellSingleQuote(process.env.CLAUDE_PLUGIN_ROOT)}`);
  }
  await appendFile(environmentFile, `${lines.join("\n")}\n`, "utf8");
}

function contextFor(event, host) {
  return { host, sessionId: extractSessionId(event), cwd: extractCwd(event) };
}

function hardDispatch(config, state) {
  return config.dispatch === "block" || (config.dispatch === "workflow" && state.run?.phase === "open");
}

function reportDispatch(config, state) {
  return config.dispatch === "report" || (config.dispatch === "workflow" && state.run?.phase !== "open");
}

function dispatchProblem(message, hard, report) {
  if (hard) return preToolDeny(`[Subagent Workflow Guard] ${message}`);
  if (report) return additionalContext("PreToolUse", `[Subagent Workflow Guard] ${message}`);
  return null;
}

async function syncMailbox(context, marker = null) {
  let request;
  try {
    request = await readMailboxRun(context);
  } catch (error) {
    if (/not a git repository/iu.test(String(error?.stderr ?? error?.message ?? ""))) return readState(context);
    throw error;
  }
  if (!request) return readState(context);
  if (request.version !== 1 || request.sessionId !== context.sessionId ||
      !/^[a-zA-Z0-9._-]{1,96}$/u.test(request.runId) || !["requested", "open", "closed"].includes(request.phase)) {
    throw new Error("workflow mailbox request is invalid");
  }
  if (request.phase === "closed") return readState(context);
  let mailboxApplication = null;
  if (marker) mailboxApplication = await readMailboxApplication(context, marker.applicationId);
  const { state } = await updateState(context, async (next) => {
    if (!next.run) {
      next.run = { id: request.runId, phase: "open", openedAt: Date.now(), closedAt: null, completion: null };
      next.applications = {};
      next.bindings = {};
    } else if (next.run.phase === "open" && next.run.id !== request.runId) {
      throw new Error(`mailbox run ${request.runId} conflicts with active run ${next.run.id}`);
    }
    if (!marker || next.applications[marker.applicationId] || next.run?.phase !== "open") return;
    const application = mailboxApplication?.application;
    if (!application || mailboxApplication.version !== 1 || mailboxApplication.sessionId !== context.sessionId || mailboxApplication.runId !== next.run.id ||
        application.id !== marker.applicationId || application.nonce !== marker.nonce ||
        !/^[a-f0-9]{32}$/u.test(application.nonce)) {
      throw new Error("mailbox application marker is invalid");
    }
    const stored = stageApplication(next, application, { nonce: application.nonce, createdAt: application.createdAt });
    stored.artifactPath = await writeApplicationArtifact(context, stored);
  });
  return state;
}

async function recordDenial(context, state, event, reason) {
  if (!state.run?.id) return;
  const tool = extractToolUseId(event) || "unknown";
  await updateState(context, (next) => {
    next.denials ??= [];
    next.denials.push({ runId: state.run.id, toolUseId: tool, reason, host: context.host, at: Date.now() });
    next.denials = next.denials.slice(-100);
  });
  warn(`DENY run=${state.run.id} tool=${tool} reason=${reason}`);
}

async function runPre(event, context, config) {
  if (config.dispatch === "off") return;
  let state;
  try {
    state = await readState(context);
  } catch (error) {
    if (isAgentTool(event) || extractAgentId(event)) {
      const tool = extractToolUseId(event) || "unknown";
      warn(`DENY run=unknown tool=${tool} reason=state-unreadable`);
      writeJson(preToolDeny(`[Subagent Workflow Guard] workflow state is unreadable: ${error?.message ?? error}`));
      return;
    }
    throw error;
  }

  if (isAgentTool(event)) {
    const marker = parseApplicationMarker(extractAgentPrompt(event));
    try {
      state = await syncMailbox(context, marker);
    } catch (error) {
      await recordDenial(context, state, event, "mailbox-import-failed");
      writeJson(preToolDeny(`[Subagent Workflow Guard] ${error?.message ?? error}`));
      return;
    }
    const hard = hardDispatch(config, state);
    const report = reportDispatch(config, state);
    if (extractAgentId(event) || extractParentAgentId(event)) {
      writeJson(dispatchProblem("nested subagent dispatch is not allowed", true, false));
      return;
    }
    const prompt = extractAgentPrompt(event);
    if (prompt.length > 2048) {
      writeJson(dispatchProblem("dispatch prompt exceeds 2 KiB; put context in the application artifact", hard, report));
      return;
    }
    if (!marker) {
      if (hard) {
        const tool = extractToolUseId(event) || "unknown";
        await recordDenial(context, state, event, "missing-application");
        writeJson(preToolDeny(`[subagent-workflow-guard] DENY run=${state.run?.id ?? "none"} tool=${tool} reason=missing-application\n[Subagent Workflow Guard] write and register a subagent application before dispatch`));
      } else {
        writeJson(dispatchProblem("write and register a subagent application before dispatch", false, report));
      }
      return;
    }
    try {
      await updateState(context, (next) => {
        const application = next.applications[marker.applicationId];
        if (!application || application.nonce !== marker.nonce) throw new Error("application marker is invalid");
        if (application.runId !== next.run?.id || next.run?.phase !== "open") throw new Error("application is not part of the active run");
        if (application.state !== "prepared") throw new Error(`application cannot be reserved from state ${application.state}`);
        for (const dependency of application.dependencies) {
          if (next.applications[dependency]?.state !== "delivered") throw new Error(`dependency is not delivered: ${dependency}`);
        }
        application.state = "reserved";
        application.reservedBy = extractToolUseId(event) || `prompt:${marker.applicationId}`;
        application.reservedAt = Date.now();
        application.requestedAgentType = extractAgentType(event);
      });
    } catch (error) {
      writeJson(dispatchProblem(error?.message ?? String(error), hard, report));
    }
    return;
  }

  const agentId = extractAgentId(event);
  const applicationId = state.bindings[agentId];
  const application = applicationId ? state.applications[applicationId] : null;
  if (!application) return;

  if (isAgentTool(event)) {
    writeJson(preToolDeny("[Subagent Workflow Guard] subagents cannot dispatch nested agents"));
    return;
  }
  const reviewer = application.role.endsWith("reviewer") || application.role === "researcher";
  if (isShellTool(event) && /(?:^|[\\/])subagent-workflow\.mjs\b/u.test(extractShellCommand(event))) {
    writeJson(preToolDeny("[Subagent Workflow Guard] a bound subagent cannot mutate or close the parent workflow state"));
    return;
  }
  if (isFileTool(event)) {
    if (reviewer) {
      writeJson(preToolDeny(`[Subagent Workflow Guard] ${application.role} is read-only`));
      return;
    }
    const targets = extractFileTargets(event);
    if (targets.length === 0 || targets.some((target) => !targetWithinScope(target, context.cwd, application.writeScope))) {
      writeJson(preToolDeny(`[Subagent Workflow Guard] file mutation is outside application writeScope: ${application.writeScope.join(", ") || "read-only"}`));
    }
    return;
  }
  if (isShellTool(event) && reviewer) {
    writeJson(preToolDeny(`[Subagent Workflow Guard] ${application.role} cannot run shell commands; use read-only tools with auditable targets`));
  }
}

async function runStart(event, context, config) {
  const state = await readState(context);
  const marker = parseApplicationMarker(extractAgentPrompt(event));
  const agentId = extractAgentId(event);
  if (!marker) {
    if (state.run?.phase === "open" && config.dispatch !== "off") {
      writeJson(additionalContext("SubagentStart", [
        "[Subagent Workflow Guard: orphan-spawn] No registered application was bound to this subagent.",
        "Stop work and return `Status: NEEDS_CONTEXT`; ask the parent to prepare and dispatch a valid application.",
      ].join("\n")));
    } else {
      writeJson(additionalContext("SubagentStart", ORDINARY_CONTEXT));
    }
    return;
  }
  let application;
  try {
    await updateState(context, (next) => {
      application = next.applications[marker.applicationId];
      if (!agentId) throw new Error("SubagentStart does not contain agent_id");
      if (!application || application.nonce !== marker.nonce || application.state !== "reserved") {
        throw new Error("spawn has no matching reserved application");
      }
      application.state = "bound";
      application.agentId = agentId;
      application.boundAt = Date.now();
      next.bindings[agentId] = application.id;
    });
    writeJson(additionalContext("SubagentStart", formatApplicationContext(application, application.artifactPath)));
  } catch (error) {
    writeJson(additionalContext("SubagentStart", `[Subagent Workflow Guard: orphan-spawn] ${error?.message ?? error}. Stop and return Status: NEEDS_CONTEXT.`));
  }
}

async function runSubagentStop(event, context) {
  const agentId = extractAgentId(event);
  const state = await readState(context);
  const applicationId = state.bindings[agentId];
  const application = applicationId ? state.applications[applicationId] : null;
  if (!application) {
    if (state.run?.phase === "open" && !event?.stop_hook_active && !event?.stopHookActive) {
      writeJson(stopDeny("[Subagent Workflow Guard] orphan subagent cannot complete an active governed run; return NEEDS_CONTEXT."));
    }
    return;
  }
  const result = validateResultCard(extractAssistantMessage(event), application);
  if (!result.valid) {
    if (!event?.stop_hook_active && !event?.stopHookActive) {
      writeJson(stopDeny(`[Subagent Workflow Guard] Result Card is incomplete. Missing: ${result.missing.join(", ")}.`));
    }
    return;
  }
  await updateState(context, (next) => {
    const current = next.applications[applicationId];
    current.state = "delivered";
    current.resultStatus = result.status;
    current.returnedAt = Date.now();
  });
}

async function runPost(event, context, failed) {
  if (!isAgentTool(event)) return;
  const marker = parseApplicationMarker(extractAgentPrompt(event));
  if (!marker) return;
  let message = "";
  await updateState(context, (state) => {
    const application = state.applications[marker.applicationId];
    if (!application || application.nonce !== marker.nonce) return;
    application.dispatchObservedAt = Date.now();
    if (failed && application.state === "reserved") {
      application.state = "prepared";
      application.reservedBy = null;
      message = `Dispatch failed before SubagentStart; application ${application.id} was released for retry.`;
    } else if (application.state === "delivered") {
      message = `Application ${application.id} returned ${application.resultStatus}.`;
    } else {
      message = `Application ${application.id} was dispatched asynchronously; SubagentStop remains authoritative.`;
    }
  });
  if (message) writeJson(additionalContext(failed ? "PostToolUseFailure" : "PostToolUse", `[Subagent Workflow Guard] ${message}`));
}

async function runPrompt(event, context) {
  const match = extractPrompt(event).trim().match(/^SUBAGENT_WORKFLOW_ABORT\s+([a-zA-Z0-9._-]{1,96})$/u);
  if (!match) return;
  let aborted = false;
  await updateState(context, (state) => {
    if (state.run?.phase === "open" && state.run.id === match[1]) {
      state.run.phase = "closed";
      state.run.completion = "BLOCKED";
      state.run.closeReason = "user-abort";
      state.run.closedAt = Date.now();
      aborted = true;
    }
  });
  if (aborted) writeJson(additionalContext("UserPromptSubmit", `[Subagent Workflow Guard] Run ${match[1]} aborted by explicit user instruction.`));
}

async function runStop(event, context) {
  let state;
  try {
    state = await syncMailbox(context);
  } catch (error) {
    writeJson(stopDeny(`[Subagent Workflow Guard] workflow mailbox is unreadable: ${error?.message ?? error}`));
    return;
  }
  let closeError = "";
  try {
    const request = await readMailboxClose(context);
    if (request && request.version === 1 && request.sessionId === context.sessionId &&
        state.run?.phase === "open" && request.runId === state.run.id) {
      const updated = await updateState(context, (next) => closeRun(next, request.completion));
      state = updated.state;
      await writeMailboxRun(context, { version: 1, sessionId: context.sessionId, runId: request.runId, phase: "closed", completion: request.completion, closedAt: Date.now() });
      await removeMailboxClose(context);
    }
  } catch (error) {
    closeError = ` Close request rejected: ${error?.message ?? error}.`;
  }
  if (state.run?.phase !== "open") return;
  const pending = Object.values(state.applications)
    .filter((application) => application.runId === state.run.id && application.state !== "delivered")
    .map((application) => `${application.id}:${application.state}`);
  const details = pending.length > 0 ? ` Pending: ${pending.join(", ")}.` : "";
  writeJson(stopDeny(`[Subagent Workflow Guard] Governed run ${state.run.id} is still open.${details}${closeError} Use subagent-plan-execution to finish reviews and run-close, or ask the user for SUBAGENT_WORKFLOW_ABORT ${state.run.id}.`));
}

export async function main(mode = process.argv[2], host = process.argv[3]) {
  if (!new Set(["claude", "codex"]).has(host)) return;
  const event = await readStdinJson();
  if (event.__parseError) return;
  const context = contextFor(event, host);
  if (!context.sessionId) return;
  const config = await loadConfig(context.cwd, warn);
  if (mode === "session") {
    let suffix = "";
    try {
      if (host === "claude") await persistClaudeSession(context);
      const state = await readState(context);
      suffix = state.run?.phase === "open" ? `\nActive governed run: ${state.run.id}.` : "";
    } catch (error) {
      suffix = `\nDurable state is unavailable: ${error?.message ?? error}. Do not claim governed enforcement.`;
    }
    writeJson(additionalContext("SessionStart", `${SESSION_CONTEXT}${suffix}`));
  }
  else if (mode === "prompt") await runPrompt(event, context);
  else if (mode === "pre") await runPre(event, context, config);
  else if (mode === "start") await runStart(event, context, config);
  else if (mode === "subagent-stop") await runSubagentStop(event, context);
  else if (mode === "post") await runPost(event, context, false);
  else if (mode === "failure") await runPost(event, context, true);
  else if (mode === "stop") await runStop(event, context);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    warn(`hook failed open: ${error?.message ?? error}`);
    process.exit(0);
  });
}
