#!/usr/bin/env node
import {
  consumeNoticeDelta,
  ensureCapabilityWorkspace,
  isProposalInboxTarget,
  proposalLocation,
  renderHumanNotice,
  validateProposalDocument
} from "../chunks/chunk-EKTUWPJL.mjs";

// plugins/project-capability-governance/src/entries/hooks/project-capability-governance-hook.ts
import { execFileSync } from "node:child_process";
import { appendFile, lstat } from "node:fs/promises";
import { resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// plugins/project-capability-governance/src/lib/hook-io.ts
import { isAbsolute, resolve } from "node:path";
async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}
function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}
function extractSessionId(event) {
  return event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? "unknown";
}
function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}
function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}
function extractShellCommand(event) {
  if (!SHELL_TOOLS.test(String(extractToolName(event)))) return null;
  const input = extractToolInput(event);
  const value = input?.command ?? input?.cmd ?? input?.script ?? "";
  return typeof value === "string" ? value : "";
}
function extractShellWorkingDirectory(event) {
  if (!SHELL_TOOLS.test(String(extractToolName(event)))) return null;
  const input = extractToolInput(event);
  const value = input?.workdir ?? input?.cwd ?? input?.working_directory ?? input?.workingDirectory;
  if (typeof value !== "string" || !value.trim()) return null;
  return isAbsolute(value) ? resolve(value) : resolve(extractCwd(event), value);
}
function extractFileTargets(event) {
  if (!FILE_TOOLS.test(String(extractToolName(event)))) return [];
  const input = extractToolInput(event);
  const cwd = resolve(extractCwd(event));
  const values = [];
  for (const key of ["file_path", "filePath", "path", "target_file"]) {
    if (typeof input?.[key] === "string") values.push(input[key]);
  }
  const patch = typeof input === "string" ? input : input?.patch ?? input?.input ?? "";
  if (typeof patch === "string") {
    for (const line of patch.split("\n")) {
      const match = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
      if (match) values.push(match[1].trim());
    }
  }
  return [...new Set(values.map(
    (value) => isAbsolute(value) ? resolve(value) : resolve(cwd, value.replace(/^\.\//u, ""))
  ))];
}
function extractWriteContent(event) {
  const input = extractToolInput(event);
  const value = input?.content ?? input?.file_text ?? input?.text;
  if (typeof value === "string") return value;
  if (!/^(?:apply_patch|ApplyPatch)$/u.test(String(extractToolName(event)))) return null;
  const patch = typeof input === "string" ? input : input?.patch ?? input?.input ?? "";
  if (typeof patch !== "string") return null;
  const lines = patch.split("\n");
  const directives = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^\*\*\*\s+(?:Add|Update|Delete) File:\s+/u.test(line));
  if (directives.length !== 1 || !/^\*\*\*\s+Add File:\s+/u.test(directives[0].line)) return null;
  const end = lines.indexOf("*** End Patch", directives[0].index + 1);
  if (end < 0) return null;
  const body = lines.slice(directives[0].index + 1, end);
  if (body.length === 0 || body.some((line) => !line.startsWith("+"))) return null;
  return body.map((line) => line.slice(1)).join("\n");
}
function isFileTool(event) {
  return FILE_TOOLS.test(String(extractToolName(event)));
}
function isShellTool(event) {
  return SHELL_TOOLS.test(String(extractToolName(event)));
}
function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function contextOutput(eventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text
    }
  };
}
function systemMessageOutput(text) {
  return { systemMessage: text };
}
function writeJson(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}
`);
}
var FILE_TOOLS = /^(?:apply_patch|ApplyPatch|Edit|MultiEdit|NotebookEdit|Write|create_file|search_replace)$/iu;
var SHELL_TOOLS = /^(?:Bash|bash|Shell|shell|shell_command|exec_command|exec|local_shell)$/iu;

// plugins/project-capability-governance/src/entries/hooks/project-capability-governance-hook.ts
function shellSingleQuote(value) {
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
    "Subagents are optional advisers. They receive no plugin-defined identity, reservation, lifecycle, write authority, or approval power."
  ].join("\n");
}
async function persistClaudeSession(event) {
  const environmentFile = process.env.CLAUDE_ENV_FILE;
  if (!environmentFile) return;
  const lines = [
    `export AI_EXPERTS_SESSION_ID=${shellSingleQuote(extractSessionId(event))}`
  ];
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    lines.push(`export PROJECT_CAPABILITY_GOVERNANCE_ROOT=${shellSingleQuote(process.env.CLAUDE_PLUGIN_ROOT)}`);
  }
  await appendFile(environmentFile, `${lines.join("\n")}
`, "utf8");
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
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return resolve2(cwd);
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
async function handleProposalWrite(event, projectRoot, locations) {
  const relevant = locations.filter(Boolean);
  if (relevant.length === 0) return false;
  if (relevant.length !== locations.length || relevant.length !== 1) {
    writeJson(preToolDeny("[Project Capability Governance] proposal writes must target one exact inbox Markdown file"));
    return true;
  }
  const location = relevant[0];
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
  } catch (error) {
    if (error?.code !== "ENOENT") {
      writeJson(preToolDeny(`[Project Capability Governance] proposal target cannot be inspected safely: ${error?.message ?? String(error)}`));
      return true;
    }
  }
  await ensureCapabilityWorkspace(projectRoot);
  return true;
}
async function runPre(event) {
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
    const targetsInbox = commandNamesInbox || workingDirectory && isProposalInboxTarget(projectRoot, workingDirectory);
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
    process.stderr.write(`[project-capability-governance] ${error?.message ?? String(error)}
`);
  }
}
var isMain = process.argv[1] && resolve2(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
export {
  resolveProjectRoot,
  runPre,
  runSession,
  runStop
};
