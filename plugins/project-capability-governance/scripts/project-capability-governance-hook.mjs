#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat } from "node:fs/promises";
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
const SESSION_CONTEXT = [
  "[Project Capability Discovery] Observe only durable, project-specific capability candidates.",
  "Qualify an SOP only after two occurrences or an explicit future-standardization request, with a reusable multi-step flow and measurable acceptance.",
  "Qualify a hard Hook only after one severe or two ordinary violations, with an observable event, deterministic predicate, target harm, recovery, and near-miss.",
  "Exclude current-task TODOs, one-offs, generic advice, and hooks whose only evidence is activation or extra model turns.",
  "When a candidate qualifies, dispatch at most one dedicated subagent in this user-prompt epoch. Start its prompt with `PROJECT_CAPABILITY_RECORDER <batch-id>` and ask it to create at most three pending proposals.",
  "The main agent must never write proposal Markdown. If a recorder subagent cannot be started, create no proposal and continue the user's task normally.",
].join("\n");

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

async function runSession() {
  writeJson(contextOutput("SessionStart", SESSION_CONTEXT));
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
  const batchId = recorderMarker(extractAgentPrompt(event));
  const agentId = extractAgentId(event);
  if (!batchId || !agentId) return;
  const bound = await updateWorkflowState(event, projectRoot, (state) => {
    const reservation = state.reservations[batchId];
    if (!reservation || reservation.epoch !== state.epoch) return false;
    state.bindings[agentId] = { batchId, epoch: state.epoch, submitted: 0, proposalIds: [] };
    return true;
  });
  if (!bound) return;
  writeJson(contextOutput("SubagentStart", [
    "[Project Capability Recorder] You are the dedicated recorder for this batch.",
    "Re-check the hard qualification criteria; returning without a file is valid.",
    "Create at most three new files under `.project-capabilities/inbox/pending/` using Write/create_file only.",
    "Each filename must equal `<proposal_id>.md`; do not edit existing proposals or dispatch another agent.",
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
  if (location.status !== "pending" || !/^(?:Write|create_file)$/iu.test(String(extractToolName(event)))) {
    writeJson(preToolDeny("[Project Capability Governance] a recorder may only create a new pending proposal with Write/create_file"));
    return true;
  }
  const checked = validateProposalDocument(extractWriteContent(event) ?? "", location.fileName);
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
