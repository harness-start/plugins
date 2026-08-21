#!/usr/bin/env node
// harness-source-hash: sha256:8160039de3e01087503b14d31cd664d7fa07b3e9809e899db17537cbab985ce1
import {
  eventCwd,
  eventToolInput,
  eventToolName,
  formatFindings,
  inspectChange,
  isRecord
} from "../chunks/chunk-LA24P3TV.mjs";

// plugins/spec-driven-development/src/entries/hooks/spec-driven-development-hook.ts
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

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

// plugins/spec-driven-development/src/entries/hooks/spec-driven-development-hook.ts
var ARTIFACTS = /* @__PURE__ */ new Set(["spec.md", "plan.md", "tasks.md"]);
var TARGET_PATH_CODES = /* @__PURE__ */ new Set(["invalid-change-name", "invalid-spec-root", "symlink-artifact", "artifact-read-error"]);
function isArtifactName(value) {
  return value !== void 0 && ARTIFACTS.has(value);
}
function isErrno(error) {
  return isRecord(error) && typeof error.code === "string";
}
function targets(event) {
  const core = extractFileTargets(event, { includeShellWrites: true });
  if (!isShellTool(eventToolName(event))) return core;
  const cwd = resolve2(eventCwd(event));
  const extras = [];
  const command = extractShellCommand(event) ?? "";
  for (const match of command.matchAll(/\b(?:cp|mv|install)\b(?:\s+-[^\s]+)*\s+[^\s;&|]+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    const raw = String(match[1] ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (raw && !raw.startsWith("-")) extras.push(isAbsolute2(raw) ? resolve2(raw) : resolve2(cwd, raw.replace(/^\.\//u, "")));
  }
  return [.../* @__PURE__ */ new Set([...core, ...extras])];
}
function directArtifactTarget(path, workspaceRoot) {
  const absolute = resolve2(path);
  const changeDir = dirname(absolute);
  if (dirname(changeDir) !== resolve2(workspaceRoot, ".specs")) return null;
  const artifact = absolute.split("/").at(-1);
  if (!isArtifactName(artifact)) return null;
  return { artifact, changeDir };
}
function canonicalPath(path) {
  let cursor = resolve2(path);
  const suffix = [];
  while (true) {
    try {
      return resolve2(realpathSync(cursor), ...suffix);
    } catch (error) {
      if (!isErrno(error) || error.code !== "ENOENT" && error.code !== "ENOTDIR") return resolve2(path);
    }
    const parent = dirname(cursor);
    if (parent === cursor) return resolve2(path);
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
}
function repositoryRoot(start) {
  let cursor = resolve2(start);
  while (true) {
    if (existsSync(resolve2(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return resolve2(start);
    cursor = parent;
  }
}
function artifactTarget(path, workspaceRoot) {
  return directArtifactTarget(path, workspaceRoot) ?? directArtifactTarget(canonicalPath(path), canonicalPath(workspaceRoot));
}
function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[SDD Workflow] ${reason}` } };
}
function diagnostic(text) {
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `[SDD Workflow] ${text}` } };
}
function upstreamFindings(target, inspection) {
  const findings = [];
  if (target.artifact === "plan.md") {
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first.", artifact: null });
    else findings.push(...inspection.spec.findings);
  }
  if (target.artifact === "tasks.md") {
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first.", artifact: null });
    else findings.push(...inspection.spec.findings);
    if (!inspection.plan) findings.push({ code: "missing-plan", message: "Create plan.md after spec.md.", artifact: null });
    else findings.push(...inspection.plan.findings);
  }
  return findings;
}
function targetPathFindings(target, inspection) {
  return inspection.findings.filter((item) => TARGET_PATH_CODES.has(item.code) && (item.artifact === target.artifact || item.artifact === target.changeDir.split("/").at(-1)));
}
function evaluateHook(mode, event) {
  const rawCwd = event?.cwd;
  const workspaceRoot = repositoryRoot(typeof rawCwd === "string" ? rawCwd : rawCwd == null ? process.cwd() : String(rawCwd));
  const resolvedTargets = targets(event ?? {});
  const artifacts = resolvedTargets.map((path) => artifactTarget(path, workspaceRoot)).filter((target) => target !== null);
  if (artifacts.length === 0) return null;
  if (mode === "pre") {
    const command = isShellTool(eventToolName(event ?? {})) ? String(extractShellCommand(event ?? {}) ?? "") : "";
    if (command && /(?:&&|\|\||;|\n)/u.test(command)) return deny("Compound shell writes that target .specs artifacts are not safe; write one artifact per tool call.");
    for (const target of artifacts) {
      const sameChange = artifacts.filter((candidate) => candidate.changeDir === target.changeDir).map(({ artifact }) => artifact);
      if (target.artifact === "plan.md" && sameChange.includes("spec.md") || target.artifact === "tasks.md" && (sameChange.includes("spec.md") || sameChange.includes("plan.md"))) {
        return deny("A single tool call cannot change an upstream artifact and its downstream artifact together.");
      }
      const inspection = inspectChange(target.changeDir);
      const findings = [...targetPathFindings(target, inspection), ...upstreamFindings(target, inspection)];
      if (findings.length > 0) return deny(`${target.artifact} is blocked: ${formatFindings(findings)}`);
    }
    return null;
  }
  if (mode === "post") {
    const messages = [];
    for (const target of artifacts) {
      const inspection = inspectChange(target.changeDir);
      const result = target.artifact === "spec.md" ? inspection.spec : target.artifact === "plan.md" ? inspection.plan : inspection.tasks;
      if (!result) messages.push(`${target.artifact} is missing after the write.`);
      else if (result.findings.length > 0) messages.push(`${target.artifact} is invalid: ${formatFindings(result.findings)}`);
    }
    return messages.length > 0 ? diagnostic(messages.join(" ")) : null;
  }
  return null;
}
async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event;
  try {
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    event = isRecord(parsed) ? parsed : {};
  } catch {
    return;
  }
  const result = evaluateHook(process.argv[2] ?? "pre", event);
  if (result) process.stdout.write(`${JSON.stringify(result)}
`);
}
var isEntry = process.argv[1] && resolve2(process.argv[1]) === resolve2(fileURLToPath(import.meta.url));
if (isEntry) await main();
export {
  evaluateHook
};
