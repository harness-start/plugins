#!/usr/bin/env node
// harness-source-hash: sha256:02595068c90d146741494a1d7e3701df870fdf2e07ae36924de0998fb9f13936
import {
  SEAL_PREFIX,
  isProtectedReportPath,
  parseReportArgs,
  reportPath,
  sha256,
  verifyReport
} from "../chunks/chunk-42B7SUE3.mjs";

// plugins/work-report-insights/src/entries/hooks/work-report-insights-hook.ts
import { readFile as readFile3 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { resolve as resolve4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

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
function eventSessionId(event) {
  const context = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context?.session_id
  );
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
function eventAssistantMessage(event) {
  return firstString(
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistant_text,
    event.assistantText
  );
}

// core/src/hook-output.ts
function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function additionalContext(hookEventName, context, options = {}) {
  if (options.echoStderr) process.stderr.write(`${context}
`);
  if (options.suppressJson) return null;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context
    }
  };
}
function stopBlock(reason) {
  return { decision: "block", reason };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";
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

// plugins/work-report-insights/src/lib/hook-io.ts
function extractCwd(event) {
  return eventCwd(event);
}
function extractSessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "hook";
}
function extractToolName(event) {
  return eventToolName(event);
}
function extractToolResponse(event) {
  return eventToolResponse(event);
}
function toolReportedFailure(event) {
  if (event?.error) return true;
  const response = extractToolResponse(event);
  if (response == null) return false;
  if (typeof response === "string") {
    return /\b(?:exit(?:ed)?\s+(?:code|status)|exit_code)\s*[:=]?\s*[1-9]\d*\b|\b(?:command|tool)\s+failed\b/iu.test(response);
  }
  if (typeof response !== "object") return false;
  if (response.isError === true || response.success === false) return true;
  const exitCode = response.exit_code ?? response.exitCode;
  if (Number.isInteger(exitCode) && exitCode !== 0) return true;
  return /^(?:error|failed|failure)$/iu.test(String(response.status ?? response.outcome ?? ""));
}
function extractAssistantMessage(event) {
  return eventAssistantMessage(event);
}
function isFileMutationTool2(event) {
  return isFileMutationTool(extractToolName(event));
}
function isShellTool2(event) {
  return isShellTool(extractToolName(event));
}
function extractFileTargets2(event) {
  return extractFileTargets(event, { tools: "any" });
}
function contextOutput(eventName, text) {
  return additionalContext(eventName, text);
}
function stopDeny(reason) {
  return stopBlock(reason);
}

// plugins/work-report-insights/src/lib/hook-policy.ts
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute as isAbsolute2, join, relative, resolve as resolve2, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
var OFFICIAL = /* @__PURE__ */ new Map([
  ["daily-work-report-collect.mjs", ["daily", "collect"]],
  ["daily-work-report-transcript-scan.mjs", ["daily", "scan"]],
  ["daily-work-report-prepare.mjs", ["daily", "prepare"]],
  ["daily-work-report-save.mjs", ["daily", "save"]],
  ["weekly-work-report-collect.mjs", ["weekly", "collect"]],
  ["weekly-work-report-transcript-scan.mjs", ["weekly", "scan"]],
  ["weekly-work-report-prepare.mjs", ["weekly", "prepare"]],
  ["weekly-work-report-save.mjs", ["weekly", "save"]],
  ["work-summary-report-collect.mjs", ["summary", "collect"]],
  ["work-summary-report-transcript-scan.mjs", ["summary", "scan"]],
  ["work-summary-report-prepare.mjs", ["summary", "prepare"]],
  ["work-summary-report-save.mjs", ["summary", "save"]],
  ["work-report-insights-addition-prepare.mjs", ["report", "addition-prepare"]],
  ["work-report-insights-append.mjs", ["report", "append"]],
  ["work-report-insights-verify.mjs", ["report", "verify"]]
]);
var DEFAULT_PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));
function tokenize(command) {
  if (/[;&|<>`\n]|\$\(/u.test(command)) return null;
  return (command.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/gu) ?? []).map((token) => {
    if (token.startsWith('"') && token.endsWith('"') || token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
    return token;
  });
}
function parseOfficialCommand(command) {
  const tokens = tokenize(String(command ?? ""));
  if (!tokens) return null;
  let index = 0;
  const assignments = [];
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index] ?? "")) {
    assignments.push(tokens[index]);
    index += 1;
  }
  if (basename(tokens[index] ?? "") !== "node") return null;
  const script = tokens[index + 1];
  const contract = OFFICIAL.get(basename(script ?? ""));
  if (!contract) return null;
  const [kind, action] = contract;
  if (assignments.some((item) => /^(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)=/u.test(item))) {
    return { kind, action, script, error: "host-owned plugin root must not be overridden" };
  }
  try {
    return { kind, action, script, args: parseReportArgs(kind, action, tokens.slice(index + 2)) };
  } catch (error) {
    return { kind, action, script, error: error?.message ?? String(error) };
  }
}
async function officialScriptTrusted(official, options = {}) {
  if (!official?.script || !OFFICIAL.has(basename(official.script))) return false;
  if (/^\$\{(?:PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}\/dist\/cli\/[a-z0-9-]+\.mjs$/u.test(official.script)) return true;
  const pluginRoot = resolve2(options.pluginRoot ?? DEFAULT_PLUGIN_ROOT);
  const cwd = resolve2(options.cwd ?? process.cwd());
  const actual = resolve2(cwd, official.script);
  const expected = join(pluginRoot, "dist", "cli", basename(official.script));
  return await physicalPath(actual) === await physicalPath(expected);
}
function reportsRoot(home2) {
  return resolve2(home2, ".ai-experts");
}
function inside(candidate, parent) {
  const rel = relative(parent, candidate);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`);
}
async function physicalPath(path) {
  try {
    return await realpath(path);
  } catch {
    try {
      return join(await realpath(dirname(path)), basename(path));
    } catch {
      return resolve2(path);
    }
  }
}
async function protectedCandidate(path, home2) {
  const lexical = resolve2(path);
  if (isProtectedReportPath(lexical, home2)) return true;
  const physical = await physicalPath(lexical);
  return isProtectedReportPath(physical, home2);
}
function shellMutates(command) {
  const text = String(command ?? "");
  return /(?:^|[\s(])(?:\/[\w./-]+\/)?(?:rm|mv|cp|tee|truncate|shred|unlink|chmod|chown|rsync|dd|install|touch|mkdir)\b/iu.test(text) || /(?:^|[^<])>{1,2}\s*[^&]/u.test(text) || /\bfind\b[\s\S]*(?:-delete|-exec|-execdir)\b/iu.test(text) || /\bsed\b[\s\S]*(?:-[A-Za-z]*i[A-Za-z]*|--in-place)\b/iu.test(text) || /\b(?:python3?|node|ruby|perl)\b[\s\S]*(?:writeFile|unlink|rename|truncate|open\s*\([^)]*["']w)/iu.test(text);
}
function shellTokens(command, home2) {
  const raw = String(command ?? "").match(/"(?:\\.|[^"])*"|'[^']*'|[^\s;|&<>`]+/gu) ?? [];
  return raw.map((token) => token.replace(/^['"]|['"]$/gu, "")).map((token) => token.replace(/^\$\{HOME\}|^\$HOME|^~/u, home2)).filter((token) => token && !token.startsWith("-") && (isAbsolute2(token) || token.startsWith(".")));
}
async function shellTargetsReports(command, cwd, home2) {
  const root = reportsRoot(home2);
  if (String(command).includes(".ai-experts")) return true;
  for (const token of shellTokens(command, home2)) {
    const candidate = resolve2(cwd, token);
    const physical = await physicalPath(candidate);
    if (isProtectedReportPath(candidate, home2) || isProtectedReportPath(physical, home2)) return true;
    if (/\b(?:rm|mv|find)\b[\s\S]*(?:-r|-R|--recursive|-delete)/iu.test(command) && (inside(root, candidate) || inside(candidate, root) || inside(root, physical) || inside(physical, root))) return true;
  }
  return false;
}
async function candidateDigest(path) {
  const body = await readFile(resolve2(path), "utf8");
  const normalized = body.endsWith("\n") ? body : `${body}
`;
  return sha256(normalized);
}
function denyReason(detail) {
  return `[Work Report Insights] Protected report

${detail}
Confirmed report bytes are immutable. Use the plugin prepare/confirm/save or addition-prepare/confirm/append workflow.`;
}
async function protectionDecision(event, options = {}) {
  const home2 = resolve2(options.home ?? process.env.HOME ?? homedir());
  const state = options.state ?? { phase: "idle" };
  if (isFileMutationTool2(event)) {
    for (const target of extractFileTargets2(event)) {
      if (await protectedCandidate(target, home2)) return { deny: true, reason: denyReason(`Blocked direct file mutation: ${target}`) };
    }
    return { deny: false };
  }
  if (!isShellTool2(event)) return { deny: false };
  const command = extractShellCommand(event) ?? "";
  const official = parseOfficialCommand(command);
  if (official?.error) return { deny: true, reason: denyReason(`Invalid official command: ${official.error}`) };
  if (official) {
    if (!await officialScriptTrusted(official, { pluginRoot: options.pluginRoot, cwd: extractCwd(event) })) {
      return { deny: true, reason: denyReason("A reserved official command name was invoked from an untrusted script path.") };
    }
    if (!(/* @__PURE__ */ new Set(["save", "append"])).has(official.action)) return { deny: false, official };
    if (state.phase !== "prepared" || state.operation !== official.action) return { deny: true, reason: denyReason("The candidate has not been prepared.") };
    const input = resolve2(extractCwd(event), official.args.input);
    if (state.candidatePath !== input || state.candidateSha256 !== await candidateDigest(input)) return { deny: true, reason: denyReason("The candidate bytes changed after confirmation.") };
    const target = official.action === "save" ? reportPath({ kind: official.kind, ...official.args, home: home2 }) : resolve2(extractCwd(event), official.args.report);
    if (state.target !== target) return { deny: true, reason: denyReason("The confirmed target does not match this command.") };
    if (official.action === "append" && state.reportSha256 !== sha256(await readFile(target))) {
      return { deny: true, reason: denyReason("The sealed report changed after the addition was prepared.") };
    }
    return { deny: false, official };
  }
  if (shellMutates(command) && await shellTargetsReports(command, extractCwd(event), home2)) {
    return { deny: true, reason: denyReason("Shell mutation targets the report tree or a resolved report symlink.") };
  }
  return { deny: false };
}

// plugins/work-report-insights/src/lib/hook-state.ts
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile as readFile2, rename, rm, writeFile } from "node:fs/promises";
import { dirname as dirname2, join as join3, resolve as resolve3 } from "node:path";

// core/src/plugin-workdir.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PLUGIN_WORKDIR_GITIGNORE = "*\n";
function normalizeGitignore(text) {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}
function isStalePluginWorkdirGitignore(text) {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}
function ensurePluginWorkdirGitignore(pluginRoot) {
  mkdirSync(pluginRoot, { recursive: true, mode: 448 });
  const ignore = join2(pluginRoot, ".gitignore");
  let current = null;
  try {
    current = readFileSync(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 384 });
}

// plugins/work-report-insights/src/lib/hook-state.ts
var VERSION = 1;
var STATE_DIR_RELATIVE = ".work-report-insights/.state";
function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
function emptyState() {
  return {
    version: VERSION,
    phase: "idle",
    kind: null,
    candidateSha256: null,
    candidatePath: null,
    reportSha256: null,
    target: null,
    operation: null,
    updatedAt: 0
  };
}
function dataRoot(event, env = process.env) {
  if (env.WORK_REPORT_INSIGHTS_DATA) return resolve3(env.WORK_REPORT_INSIGHTS_DATA);
  return join3(resolve3(extractCwd(event)), STATE_DIR_RELATIVE);
}
function statePath(event, env = process.env) {
  const session = extractSessionId(event) || "default";
  return join3(dataRoot(event, env), `${digest(session)}.json`);
}
async function readState(event, env = process.env) {
  try {
    const parsed = JSON.parse(await readFile2(statePath(event, env), "utf8"));
    if (parsed?.version !== VERSION) return emptyState();
    return { ...emptyState(), ...parsed, version: VERSION };
  } catch {
    return emptyState();
  }
}
async function writeState(event, state, env = process.env) {
  const path = statePath(event, env);
  await mkdir(dirname2(path), { recursive: true, mode: 448 });
  const storageRoot = env.WORK_REPORT_INSIGHTS_DATA ? resolve3(env.WORK_REPORT_INSIGHTS_DATA) : join3(resolve3(extractCwd(event)), ".work-report-insights");
  ensurePluginWorkdirGitignore(storageRoot);
  const temporary = `${path}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`;
  const next = { ...emptyState(), ...state, version: VERSION, updatedAt: Date.now() };
  try {
    await writeFile(temporary, `${JSON.stringify(next)}
`, { encoding: "utf8", mode: 384, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {
    });
    throw error;
  }
  return next;
}

// plugins/work-report-insights/src/entries/hooks/work-report-insights-hook.ts
function home(env) {
  return resolve4(env.HOME || homedir2());
}
async function prepareState(event, official, env) {
  const state = await readState(event, env);
  const cwd = extractCwd(event);
  const candidatePath = resolve4(cwd, official.args.input);
  let candidate = await readFile3(candidatePath, "utf8");
  if (!candidate.trim()) throw new Error("candidate content is empty");
  if (candidate.includes(SEAL_PREFIX)) throw new Error("candidate contains a reserved seal marker");
  if (!candidate.endsWith("\n")) candidate += "\n";
  const target = official.action === "prepare" ? reportPath({ kind: official.kind, ...official.args, home: home(env) }) : resolve4(cwd, official.args.report);
  let reportSha256 = null;
  if (official.action === "addition-prepare") {
    const report = await readFile3(target, "utf8");
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
    operation: official.action === "prepare" ? "save" : "append"
  }, env);
}
async function runPre(event, env) {
  const state = await readState(event, env);
  const command = isShellTool2(event) ? extractShellCommand(event) : null;
  const official = parseOfficialCommand(command);
  const trusted = official && !official.error && await officialScriptTrusted(official, { cwd: extractCwd(event) });
  if (trusted && (/* @__PURE__ */ new Set(["prepare", "addition-prepare"])).has(official.action)) {
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
  if (!isShellTool2(event)) return;
  const official = parseOfficialCommand(extractShellCommand(event));
  if (!official || official.error) return;
  const state = await readState(event, env);
  if ((/* @__PURE__ */ new Set(["collect", "scan"])).has(official.action)) {
    await writeState(event, { ...state, phase: "evidence-collected", kind: official.kind === "report" ? state.kind : official.kind }, env);
    return;
  }
  if (!(/* @__PURE__ */ new Set(["save", "append"])).has(official.action)) return;
  if (toolReportedFailure(event) || state.phase !== "prepared" || state.operation !== official.action) return;
  try {
    const target = official.action === "save" ? reportPath({ kind: official.kind, ...official.args, home: home(env) }) : resolve4(extractCwd(event), official.args.report);
    if (target !== state.target) return;
    const content = await readFile3(target, "utf8");
    const checked = verifyReport(content);
    if (!checked.ok) return;
    if (official.action === "save" && checked.digest !== state.candidateSha256) return;
    if (official.action === "append" && sha256(content) === state.reportSha256) return;
    await writeState(event, { ...state, phase: "sealed", target, candidateSha256: null, candidatePath: null, operation: null }, env);
    writeJson(contextOutput("PostToolUse", `[Work Report Insights] Sealed report verified: ${target}
SHA-256: ${checked.digest}`));
  } catch {
  }
}
async function runStop(event, env) {
  const state = await readState(event, env);
  if (state.phase === "idle" || state.phase === "sealed") return;
  const message = extractAssistantMessage(event);
  if (/(?:\u62a5\u544a|\u65e5\u62a5|\u5468\u62a5|\u603b\u7ed3).{0,12}(?:\u5df2\u4fdd\u5b58|\u5df2\u5199\u5165|\u5df2\u751f\u6210|\u5b8c\u6210)|(?:saved|wrote|generated).{0,16}report/iu.test(message)) {
    writeJson(stopDeny("[Work Report Insights] A report completion claim requires a successful save and a verified SHA-256 seal. Continue the interview or complete prepare \u2192 confirmation \u2192 save."));
  }
}
async function main() {
  const mode = process.argv[2] ?? "pre";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const env = process.env;
  try {
    if ((/* @__PURE__ */ new Set(["prompt", "UserPromptSubmit"])).has(mode)) return;
    else if ((/* @__PURE__ */ new Set(["pre", "PreToolUse"])).has(mode)) await runPre(event, env);
    else if ((/* @__PURE__ */ new Set(["post", "PostToolUse"])).has(mode)) await runPost(event, env);
    else if ((/* @__PURE__ */ new Set(["stop", "Stop"])).has(mode)) await runStop(event, env);
  } catch (error) {
    if ((/* @__PURE__ */ new Set(["pre", "PreToolUse"])).has(mode)) {
      writeJson(preToolDeny(`[Work Report Insights] Protection check failed closed: ${error?.message ?? String(error)}`));
    } else {
      process.stderr.write(`[work-report-insights] ${error?.message ?? String(error)}
`);
    }
  }
}
var isMain = process.argv[1] && resolve4(process.argv[1]) === fileURLToPath2(import.meta.url);
if (isMain) await main();
export {
  runPost,
  runPre,
  runStop
};
