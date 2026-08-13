#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextOutput,
  extractAgentId,
  extractAgentPrompt,
  extractCwd,
  extractFileTargets,
  extractShellCommand,
  extractShellWorkingDirectory,
  extractSessionId,
  extractToolName,
  extractWriteContent,
  isAgentTool,
  isFileTool,
  isShellTool,
  preToolDeny,
  readStdinJson,
  systemMessageOutput,
  writeJson,
} from "./lib/hook-io.mjs";
import {
  consumeNoticeDelta,
  ensureCapabilityWorkspace,
  isProposalInboxTarget,
  proposalLocation,
  renderHumanNotice,
  validateProposalDocument,
} from "./lib/proposals.mjs";
import { readWorkflowState, updateWorkflowState } from "./lib/workflow-state.mjs";

const RECORDER_MARKER = /^PROJECT_CAPABILITY_RECORDER\s+([a-z0-9][a-z0-9-]{2,63})\s*$/mu;
const RECORDER_ENTRY = fileURLToPath(new URL("./project-capability-recorder.mjs", import.meta.url));

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function sessionContext() {
  const hookDataRoot = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
  const dataRootOption = hookDataRoot
    ? ` --data-root ${shellSingleQuote(resolve(hookDataRoot))}`
    : "";
  return [
    "[Project Capability Discovery] Observe only durable, project-specific capability candidates.",
    "Qualify an SOP only after two occurrences or an explicit future-standardization request, with a reusable multi-step flow and measurable acceptance.",
    "Qualify a hard Hook only after one severe or two ordinary violations, with an observable event, deterministic predicate, target harm, recovery, and near-miss.",
    "Exclude current-task TODOs, one-offs, generic advice, and hooks whose only evidence is activation or extra model turns.",
    "When a candidate qualifies, reserve then dispatch at most one dedicated subagent in this user-prompt epoch.",
    `Before dispatch, run this exact command shape without adding shell operators: \`node ${shellSingleQuote(RECORDER_ENTRY)} reserve --cwd "$PWD" --batch "<batch-id>" --request "<complete standalone recorder request>"${dataRootOption}\`.`,
    "Use the returned `PROJECT_CAPABILITY_RECORDER <batch-id>` marker as the first line of the recorder task and ask it to create at most three pending proposals.",
    "The main agent must never write proposal Markdown. If a recorder subagent cannot be started, create no proposal and continue the user's task normally.",
  ].join("\n");
}

function hasUnsafeShellSyntax(command) {
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === "`" || (character === "$" && command[index + 1] === "(")) return true;
    if (quote) {
      if (character === quote && command[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/[;&|<>\n\r]/u.test(character)) return true;
  }
  return quote !== null;
}

function isSafeRecorderReservation(command) {
  const hookDataRoot = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
  if (!hookDataRoot || hasUnsafeShellSyntax(command)) return false;
  const prefix = `node ${shellSingleQuote(RECORDER_ENTRY)} reserve --cwd "$PWD" --batch `;
  const suffix = ` --data-root ${shellSingleQuote(resolve(hookDataRoot))}`;
  return command.startsWith(prefix)
    && command.endsWith(suffix)
    && /\s--request\s+["']/u.test(command);
}

async function persistClaudeSession(event) {
  const environmentFile = process.env.CLAUDE_ENV_FILE;
  if (!environmentFile) return;
  const lines = [
    `export AI_EXPERTS_SESSION_ID=${shellSingleQuote(extractSessionId(event))}`,
  ];
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    lines.push(`export PROJECT_CAPABILITY_GOVERNANCE_ROOT=${shellSingleQuote(process.env.CLAUDE_PLUGIN_ROOT)}`);
  }
  await appendFile(environmentFile, `${lines.join("\n")}\n`, "utf8");
}

function recorderMarker(prompt) {
  return String(prompt ?? "").match(RECORDER_MARKER)?.[1] ?? null;
}

function shellMayMutate(command) {
  const value = String(command ?? "");
  if (/(?:^|[;&|()\s])(?:apply_patch|cp|dd|install|ln|mkdir|mv|rm|rmdir|tee|touch|truncate)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])(?:node|perl|php|python3?|ruby)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])(?:sed|perl)\s+[^;&|\n]*-[^\s]*i/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])git\s+(?:clean|mv|restore|rm)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[^0-9])>{1,2}(?:\s|$)/u.test(value)) return true;
  return false;
}

function resolveProjectRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

async function runStop(event) {
  const projectRoot = resolveProjectRoot(extractCwd(event));
  const delta = await consumeNoticeDelta(projectRoot);
  if (delta.length === 0) return;
  writeJson(systemMessageOutput(renderHumanNotice(delta.length)));
}

async function runSession(event) {
  await persistClaudeSession(event);
  writeJson(contextOutput("SessionStart", sessionContext()));
}

async function runPrompt(event) {
  const projectRoot = resolveProjectRoot(extractCwd(event));
  await updateWorkflowState(event, projectRoot, (state) => {
    state.epoch += 1;
    state.recorderDispatches = 0;
    state.reservations = {};
  });
}

async function runStart(event) {
  const projectRoot = resolveProjectRoot(extractCwd(event));
  const agentPrompt = extractAgentPrompt(event);
  const batchId = recorderMarker(agentPrompt);
  const agentId = extractAgentId(event);
  if (!agentId) return;
  const bound = await updateWorkflowState(event, projectRoot, (state) => {
    const current = Object.entries(state.reservations)
      .filter(([, reservation]) => reservation?.epoch === state.epoch);
    const selected = batchId
      ? current.find(([reservedBatchId]) => reservedBatchId === batchId)
      : (current.length === 1 ? current[0] : null);
    if (!selected) return false;
    const [reservedBatchId, reservation] = selected;
    delete state.reservations[reservedBatchId];
    state.bindings[agentId] = {
      batchId: reservedBatchId,
      epoch: state.epoch,
      submitted: 0,
      proposalIds: [],
    };
    return {
      request: String(reservation?.request ?? agentPrompt ?? "").trim(),
    };
  });
  if (!bound) {
    if (!batchId) return;
    writeJson(contextOutput("SubagentStart", [
      "[Project Capability Recorder] This subagent is not authorized as the recorder for the current prompt epoch.",
      "Do not use tools, write proposal files, or dispatch another agent. Return to the parent without changes.",
    ].join("\n")));
    return;
  }
  await ensureCapabilityWorkspace(projectRoot);
  writeJson(contextOutput("SubagentStart", [
    "[Project Capability Recorder] You are the dedicated recorder for this batch.",
    "Read the assigned task once. If it explicitly requests a qualifying proposal, create it immediately without inspecting source, history, acceptance infrastructure, or unrelated files; otherwise returning without a file is valid.",
    "Create at most three new files under `.project-capabilities/inbox/pending/` using Write, create_file, or one apply_patch Add File operation per proposal.",
    "Each filename must equal `<proposal_id>.md`; do not edit existing proposals or dispatch another agent.",
    "Every SOP must use YAML frontmatter with these required fields: `proposal_id: <id>`, `proposal_revision: 1`, `kind: sop`, `title: <title>`, and `status: pending`. For an explicit future-standardization request, also include `explicit_standardization: true`.",
    "After the frontmatter, use these exact level-two headings in order: `## Evidence`, `## Reuse scenarios`, `## Acceptance`, and `## Counterexample`.",
    "Under `## Reuse scenarios`, write at least two dash-prefixed bullet items (`- ...`), not a numbered list. Use dash-prefixed bullets under `## Evidence` and `## Acceptance` as well.",
    "Assigned request:",
    bound.request || "No standalone proposal request was reserved; return without changes.",
  ].join("\n")));
}

async function handleRecorderDispatch(event, projectRoot) {
  const batchId = recorderMarker(extractAgentPrompt(event));
  if (!batchId) return false;
  if (extractAgentId(event)) {
    writeJson(preToolDeny("[Project Capability Governance] recorder subagents cannot dispatch nested agents"));
    return true;
  }
  const allowed = await updateWorkflowState(event, projectRoot, (state) => {
    if (state.reservations[batchId]?.epoch === state.epoch && state.recorderDispatches === 1) {
      return true;
    }
    if (state.recorderDispatches >= 1) return false;
    state.recorderDispatches += 1;
    state.reservations[batchId] = { epoch: state.epoch };
    return true;
  });
  if (!allowed) {
    writeJson(preToolDeny("[Project Capability Governance] only one recorder subagent is allowed per user-prompt epoch"));
    return true;
  }
  await ensureCapabilityWorkspace(projectRoot);
  return true;
}

async function handleProposalWrite(event, projectRoot, locations) {
  const relevant = locations.filter(Boolean);
  if (relevant.length === 0) return false;
  if (relevant.length !== locations.length || relevant.length !== 1) {
    writeJson(preToolDeny("[Project Capability Governance] proposal writes must target one exact inbox Markdown file"));
    return true;
  }
  const location = relevant[0];
  const agentId = extractAgentId(event);
  const state = await readWorkflowState(event, projectRoot);
  const binding = agentId ? state.bindings[agentId] : null;
  if (!binding || binding.epoch !== state.epoch) {
    writeJson(preToolDeny("[Project Capability Governance] only the bound recorder subagent may create proposal Markdown"));
    return true;
  }
  const toolName = String(extractToolName(event));
  const content = extractWriteContent(event);
  if (location.status !== "pending" || !/^(?:Write|create_file|apply_patch)$/iu.test(toolName) || content === null) {
    writeJson(preToolDeny("[Project Capability Governance] a recorder may only create one new pending proposal with Write/create_file or a single Add File patch"));
    return true;
  }
  const checked = validateProposalDocument(content, location.fileName);
  if (!checked.ok) {
    writeJson(preToolDeny(`[Project Capability Governance] invalid proposal: ${checked.reason}`));
    return true;
  }
  try {
    await lstat(location.absolute);
    writeJson(preToolDeny("[Project Capability Governance] a recorder cannot overwrite an existing proposal path"));
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      writeJson(preToolDeny(`[Project Capability Governance] proposal target cannot be inspected safely: ${error?.message ?? String(error)}`));
      return true;
    }
  }
  const accepted = await updateWorkflowState(event, projectRoot, (next) => {
    const live = next.bindings[agentId];
    if (!live || live.epoch !== next.epoch || live.submitted >= 3) return false;
    if (live.proposalIds.includes(checked.proposal.id)) return false;
    live.submitted += 1;
    live.proposalIds.push(checked.proposal.id);
    return true;
  });
  if (!accepted) {
    writeJson(preToolDeny("[Project Capability Governance] recorder proposal limit or duplicate id rejected"));
  }
  return true;
}

async function runPre(event) {
  const projectRoot = resolveProjectRoot(extractCwd(event));
  if (isAgentTool(event) && await handleRecorderDispatch(event, projectRoot)) return;
  if (isFileTool(event)) {
    const targets = extractFileTargets(event);
    const locations = targets.map((target) => proposalLocation(projectRoot, target));
    if (targets.some((target) => isProposalInboxTarget(projectRoot, target)) && locations.every((location) => !location)) {
      writeJson(preToolDeny("[Project Capability Governance] non-canonical mutation under the proposal inbox is forbidden"));
      return;
    }
    if (await handleProposalWrite(event, projectRoot, locations)) return;
  }
  if (isShellTool(event)) {
    const command = extractShellCommand(event) ?? "";
    if (isSafeRecorderReservation(command)) return;
    const commandNamesInbox = /\.project-capabilities[\\/]inbox/iu.test(command);
    const workingDirectory = extractShellWorkingDirectory(event);
    const targetsInbox = commandNamesInbox
      || (workingDirectory && isProposalInboxTarget(projectRoot, workingDirectory));
    if (targetsInbox && shellMayMutate(command)) {
      writeJson(preToolDeny("[Project Capability Governance] direct shell mutation of the proposal inbox is forbidden; use the governance lifecycle command"));
    }
  }
}

async function main() {
  const mode = process.argv[2] ?? "stop";
  const event = await readStdinJson();
  if (event.__parseError) return;
  try {
    if (mode === "session" || mode === "SessionStart") await runSession(event);
    else if (mode === "prompt" || mode === "UserPromptSubmit") await runPrompt(event);
    else if (mode === "pre" || mode === "PreToolUse") await runPre(event);
    else if (mode === "start" || mode === "SubagentStart") await runStart(event);
    else if (mode === "stop" || mode === "Stop") await runStop(event);
  } catch (error) {
    process.stderr.write(`[project-capability-governance] ${error?.message ?? String(error)}\n`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

export { resolveProjectRoot, runPre, runPrompt, runSession, runStart, runStop };
