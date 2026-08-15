#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contextOutput,
  extractCwd,
  extractFileTargets,
  extractShellCommand,
  extractShellWorkingDirectory,
  extractSessionId,
  extractToolName,
  extractWriteContent,
  isFileTool,
  isShellTool,
  preToolDeny,
  readStdinJson,
  systemMessageOutput,
  writeJson,
} from "../../lib/hook-io.js";
import { isRecord, type HookEvent } from "@harness/core/hook-event";

import {
  consumeNoticeDelta,
  ensureCapabilityWorkspace,
  isProposalInboxTarget,
  proposalLocation,
  renderHumanNotice,
  validateProposalDocument,
  type ProposalLocation,
} from "../../lib/proposals.js";

function shellSingleQuote(value: string) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function sessionContext() {
  return [
    "[Project Capability Discovery] Observe only durable, project-specific capability candidates.",
    "Qualify an SOP only after two occurrences or an explicit future-standardization request, with a reusable multi-step flow and measurable acceptance.",
    "Qualify a hard Hook only after one severe or two ordinary violations, with an observable event, deterministic predicate, target harm, recovery, and near-miss.",
    "Exclude current-task TODOs, one-offs, generic advice, and hooks whose only evidence is activation or extra model turns.",
    "When a candidate qualifies, the parent agent may create one schema-valid pending proposal directly.",
    "For a difficult judgment, the parent may ask an ordinary read-only subagent for advice in plain language; the parent remains responsible for checking the evidence and writing the proposal.",
    "Subagents are optional advisers. They receive no plugin-defined identity, reservation, lifecycle, write authority, or approval power.",
  ].join("\n");
}

async function persistClaudeSession(event: HookEvent) {
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

function shellMayMutate(command: string) {
  const value = String(command ?? "");
  if (/(?:^|[;&|()\s])(?:apply_patch|cp|dd|install|ln|mkdir|mv|rm|rmdir|tee|touch|truncate)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])(?:node|perl|php|python3?|ruby)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])(?:sed|perl)\s+[^;&|\n]*-[^\s]*i/iu.test(value)) return true;
  if (/(?:^|[;&|()\s])git\s+(?:clean|mv|restore|rm)(?:\s|$)/iu.test(value)) return true;
  if (/(?:^|[^0-9])>{1,2}(?:\s|$)/u.test(value)) return true;
  return false;
}

function resolveProjectRoot(cwd: string) {
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

async function runStop(event: HookEvent) {
  const projectRoot = resolveProjectRoot(extractCwd(event));
  const delta = await consumeNoticeDelta(projectRoot);
  if (delta.length === 0) return;
  writeJson(systemMessageOutput(renderHumanNotice(delta.length)));
}

async function runSession(event: HookEvent) {
  await persistClaudeSession(event);
  writeJson(contextOutput("SessionStart", sessionContext()));
}

async function handleProposalWrite(
  event: HookEvent,
  projectRoot: string,
  locations: Array<ProposalLocation | null>,
) {
  const relevant = locations.filter((location): location is ProposalLocation => location !== null);
  if (relevant.length === 0) return false;
  if (relevant.length !== locations.length || relevant.length !== 1) {
    writeJson(preToolDeny("[Project Capability Governance] proposal writes must target one exact inbox Markdown file"));
    return true;
  }
  const location = relevant[0];
  if (!location) {
    writeJson(preToolDeny("[Project Capability Governance] proposal writes must target one exact inbox Markdown file"));
    return true;
  }
  const toolName = String(extractToolName(event));
  const content = extractWriteContent(event);
  if (location.status !== "pending" || !/^(?:Write|create_file|apply_patch)$/iu.test(toolName) || content === null) {
    writeJson(preToolDeny("[Project Capability Governance] create one new pending proposal with Write/create_file or a single Add File patch"));
    return true;
  }
  const checked = validateProposalDocument(content, location.fileName);
  if (!checked.ok) {
    writeJson(preToolDeny(`[Project Capability Governance] invalid proposal: ${checked.reason}`));
    return true;
  }
  try {
    await lstat(location.absolute);
    writeJson(preToolDeny("[Project Capability Governance] an existing proposal path cannot be overwritten"));
    return true;
  } catch (error: unknown) {
    if (!isRecord(error) || error.code !== "ENOENT") {
      writeJson(preToolDeny(`[Project Capability Governance] proposal target cannot be inspected safely: ${error instanceof Error ? error.message : String(error)}`));
      return true;
    }
  }
  await ensureCapabilityWorkspace(projectRoot);
  return true;
}

async function runPre(event: HookEvent) {
  const projectRoot = resolveProjectRoot(extractCwd(event));
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
    else if (mode === "pre" || mode === "PreToolUse") await runPre(event);
    else if (mode === "stop" || mode === "Stop") await runStop(event);
  } catch (error) {
    process.stderr.write(`[project-capability-governance] ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

export { resolveProjectRoot, runPre, runSession, runStop };
