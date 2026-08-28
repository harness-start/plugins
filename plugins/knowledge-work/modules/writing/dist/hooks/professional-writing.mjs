#!/usr/bin/env node
// harness-source-hash: sha256:4a3a4cd5dd6eee148d7e4947bd2f6617d6b3ebe34099aaf7254f848398c2d612
import {
  analyzeAiStyle
} from "../chunks/chunk-WEQSQOCL.mjs";

// plugins/knowledge-work/modules/writing/src/entries/hooks/professional-writing.ts
import { readFileSync, statSync } from "node:fs";
import { extname, relative, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
}
async function readStdinJson(input = process.stdin) {
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}
function eventToolResponse(event) {
  const tool = nestedRecord(event, "tool");
  return event.tool_response ?? event.toolResponse ?? event.tool_result ?? event.toolResult ?? event.response ?? tool?.response ?? null;
}

// core/src/hook-output.ts
var TOOL_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure"
]);
function additionalContext(hookEventName, context, options = {}) {
  const codexToolReport = Boolean(process.env.PLUGIN_ROOT) && TOOL_LIFECYCLE_EVENTS.has(hookEventName);
  const echoStderr = options.echoStderr ?? codexToolReport;
  const suppressJson = codexToolReport || Boolean(options.suppressJson);
  if (echoStderr) process.stderr.write(`${context}
`);
  if (suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context
    }
  };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";

// core/src/state-file.ts
var WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

// core/src/hook-targets.ts
var FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write"
]);
var READ_TOOLS = /* @__PURE__ */ new Set(["read"]);
var SHELL_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand"
]);
var PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "target_file",
  "output_file",
  "outputFile",
  "notebook_path",
  "notebookPath"
];
function canonicalToolName(name) {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}
function isFileMutationTool(name) {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
}
function isReadTool(name) {
  return READ_TOOLS.has(canonicalToolName(name));
}
function isShellTool(name) {
  return SHELL_TOOLS.has(canonicalToolName(name));
}
function extractShellCommand(event) {
  if (!isShellTool(eventToolName(event))) return null;
  const input = eventToolInput(event);
  const command = input.command ?? input.cmd ?? input.script;
  return typeof command === "string" ? command : null;
}
function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const record = input;
  const paths = [];
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(record.edits)) {
    for (const edit of record.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}
function patchPaths(payload) {
  const paths = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripMatchingQuotes(file[1]));
    if (move?.[1]) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}
function patchPayload(input) {
  if (typeof input === "string") return input;
  return [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
}
function resolveTargets(raw, cwd) {
  return [...new Set(
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))
  )];
}
function shellWritePaths(command) {
  const paths = [];
  const push = (raw) => {
    const value = stripMatchingQuotes(String(raw ?? ""));
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  return paths;
}
function acceptsTool(name, tools) {
  if (tools === "any") return true;
  if (isFileMutationTool(name)) return true;
  if (tools === "read-or-mutation" && isReadTool(name)) return true;
  return false;
}
function extractFileTargets(event, options = {}) {
  const tools = options.tools ?? "mutation";
  const name = eventToolName(event);
  const cwd = resolve(eventCwd(event));
  const input = eventToolInput(event);
  const raw = [];
  if (acceptsTool(name, tools)) {
    raw.push(...objectPaths(input));
    raw.push(...patchPaths(patchPayload(typeof event.tool_input === "string" ? event.tool_input : input)));
    if (typeof event.tool_input === "string") raw.push(...objectPaths(input));
  }
  if (options.includeShellWrites) {
    const command = extractShellCommand(event) ?? (typeof input.command === "string" ? input.command : null) ?? (typeof input.cmd === "string" ? input.cmd : null) ?? (typeof input.script === "string" ? input.script : null);
    if (command) raw.push(...shellWritePaths(command));
  }
  return resolveTargets(raw, cwd);
}

// plugins/knowledge-work/modules/writing/src/entries/hooks/professional-writing.ts
var MAX_MARKDOWN_BYTES = 256 * 1024;
var MAX_MARKDOWN_FILES = 8;
var MAX_REPORTED_FINDINGS = 20;
var MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown"]);
var IGNORED_PATH = /(?:^|[\\/])(?:\.acceptance-runs|\.git|\.tmp|build|coverage|dist|node_modules|vendor)(?:[\\/]|$)/u;
function warn(message) {
  process.stderr.write(`[professional-writing] ${message}
`);
}
function professionalWritingContext() {
  const loading = process.env.HARNESS_HOST === "codex" ? "Codex: read each selected Skill from this plugin's `skills/<name>/SKILL.md` before editing prose." : "Claude: invoke each selected plugin Skill through the native Skill tool before editing prose.";
  return [
    "[Professional Writing] Selective writing Skill orchestration",
    loading,
    "Whenever the response requires the user to carry out a procedure, troubleshoot, choose among options, recover from an error, or continue unfinished work, you MUST load `actionable-response` before answering. This is the default for action-heavy responses; do not wait for the user to request concise or ADHD-friendly wording. Never diagnose or label the user.",
    "For a knowledge-only answer or fully completed task, give the answer or result directly and do not manufacture a next action.",
    "Load `visual-explanation` when the user asks to see the topic visually, or when relationships, sequence, hierarchy, or state changes become materially clearer in the smallest useful visual. Do not force a visual onto a simple question.",
    "Use `writing-terse-output` only for an explicit terse-output request.",
    "For English prose, require `writing-english-prose`.",
    "For Chinese prose, require `writing-chinese-prose` and bundled `ai-flavor-remover`.",
    "For human-readable Markdown prose, also require `writing-markdown-ai-style`. Locate signals with `node <plugin>/dist/cli/analyze-ai-style.mjs <file>`; the report is evidence, not an automatic rewrite.",
    "For substantial mixed-language prose, use both language routes; isolated foreign terms follow the main language.",
    "Exclude code, commands, configuration, machine output, quotations, and exact short replies. Preserve facts, numbers, URLs, identifiers, citations, and Markdown structure."
  ].join("\n");
}
async function runSessionStart() {
  const event = await readStdinJson();
  if (event.__parseError) return warn("invalid hook input; advisory context was skipped");
  writeJson(additionalContext("SessionStart", professionalWritingContext()));
}
function displayPath(cwd, filePath) {
  const local = relative(cwd, filePath);
  return local && !local.startsWith("..") ? local : filePath;
}
function shellWord(value) {
  if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}
function sedInPlaceTargets(event) {
  const command = extractShellCommand(event);
  if (!command) return [];
  const cwd = eventCwd(event);
  const paths = [];
  for (const segment of command.split(/&&|\|\||[;|]/u)) {
    const words = segment.match(/"[^"]*"|'[^']*'|[^\s]+/gu) ?? [];
    const sed = words.findIndex((word) => /(?:^|[\\/])sed$/u.test(shellWord(word)));
    if (sed < 0) continue;
    let index = sed + 1;
    let inPlace = false;
    let expressionProvided = false;
    while (index < words.length) {
      const word = shellWord(words[index] ?? "");
      if (word === "--in-place" || word.startsWith("--in-place=") || /^-[^-]*i/u.test(word)) {
        inPlace = true;
        index += 1;
        continue;
      }
      if (word === "-e" || word === "-f" || word === "--expression" || word === "--file") {
        expressionProvided = true;
        index += 2;
        continue;
      }
      if (word.startsWith("--expression=") || word.startsWith("--file=")) {
        expressionProvided = true;
        index += 1;
        continue;
      }
      if (word.startsWith("-")) {
        index += 1;
        continue;
      }
      break;
    }
    if (!inPlace) continue;
    if (!expressionProvided) index += 1;
    for (const word of words.slice(index)) {
      const target = shellWord(word);
      if (!target || target.startsWith("-") || /[*?[\]<>]/u.test(target)) continue;
      paths.push(resolve2(cwd, target));
    }
  }
  return paths;
}
function markdownTargets(event) {
  const cwd = eventCwd(event);
  const response = eventToolResponse(event);
  const changes = isRecord(response) && isRecord(response.changes) ? Object.keys(response.changes).map((filePath) => resolve2(cwd, filePath)) : [];
  return [.../* @__PURE__ */ new Set([
    ...extractFileTargets(event, { tools: "mutation", includeShellWrites: true }),
    ...sedInPlaceTargets(event),
    ...changes
  ])].filter((filePath) => MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase())).filter((filePath) => !IGNORED_PATH.test(filePath)).slice(0, MAX_MARKDOWN_FILES);
}
function scanMarkdownTarget(cwd, filePath) {
  const path = displayPath(cwd, filePath);
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return { findings: [], skipped: [] };
    if (stat.size > MAX_MARKDOWN_BYTES) {
      return {
        findings: [],
        skipped: [{ path, reason: `file exceeds the ${MAX_MARKDOWN_BYTES}-byte automatic scan limit` }]
      };
    }
    return {
      findings: analyzeAiStyle(readFileSync(filePath, "utf8")).map((finding) => ({ ...finding, path })),
      skipped: []
    };
  } catch {
    return { findings: [], skipped: [] };
  }
}
function markdownPostToolReport(event) {
  const cwd = eventCwd(event);
  const findings = [];
  const skipped = [];
  for (const filePath of markdownTargets(event)) {
    const result = scanMarkdownTarget(cwd, filePath);
    findings.push(...result.findings);
    skipped.push(...result.skipped);
  }
  if (!findings.length && !skipped.length) return "";
  return [
    "[Professional Writing] Markdown AI-style findings after observed write",
    ...findings.slice(0, MAX_REPORTED_FINDINGS).map((finding) => `- [${finding.severity}] ${finding.id} ${finding.path}:${finding.line} ${finding.message} ${finding.suggestion}`),
    ...skipped.map((item) => `- [report] ${item.path}: automatic scan skipped because ${item.reason}; run the bundled analyzer CLI explicitly.`),
    "Treat each finding as review evidence, not an automatic rewrite instruction. Preserve facts, quotations, code, links, and intentional voice."
  ].join("\n");
}
async function runPostToolUse(event) {
  const current = event ?? await readStdinJson();
  if (current.__parseError) return warn("invalid hook input; Markdown scan was skipped");
  const report = markdownPostToolReport(current);
  if (report) {
    writeJson(process.env.HARNESS_HOST === "codex" ? {
      continue: false,
      stopReason: "Markdown AI-style review feedback replaced the ordinary tool success output.",
      reason: report
    } : additionalContext("PostToolUse", report));
  }
}
if (process.argv[1] && resolve2(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] === "post" ? runPostToolUse : runSessionStart;
  run().catch((error) => warn(error instanceof Error ? error.message : String(error)));
}
export {
  markdownPostToolReport,
  professionalWritingContext,
  runPostToolUse,
  runSessionStart
};
