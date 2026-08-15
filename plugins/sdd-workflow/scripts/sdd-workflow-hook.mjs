#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatFindings, inspectChange } from "./lib/artifacts.mjs";

const FILE_TOOLS = new Set(["applypatch", "edit", "multiedit", "notebookedit", "write", "createfile", "searchreplace"]);
const SHELL_TOOLS = new Set(["bash", "exec", "execcommand", "localshell", "shell", "shellcommand"]);
const ARTIFACTS = new Set(["spec.md", "plan.md", "tasks.md"]);
const TARGET_PATH_CODES = new Set(["invalid-change-name", "invalid-spec-root", "symlink-artifact", "artifact-read-error"]);

function toolName(event) {
  return String(event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "").replaceAll("_", "").toLowerCase();
}

function toolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

function nestedPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "notebook_path"]) if (typeof input[key] === "string") paths.push(input[key]);
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...nestedPaths(edit));
  return paths;
}

function patchPaths(input) {
  const text = typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
  const paths = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u) ?? line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (match) paths.push(match[1].trim().replace(/^['"]|['"]$/gu, ""));
  }
  return paths;
}

function shellPaths(command) {
  const paths = [];
  const push = (value) => {
    const clean = String(value ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (clean && !clean.startsWith("-")) paths.push(clean);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\b(?:cp|mv|install)\b(?:\s+-[^\s]+)*\s+[^\s;&|]+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  return paths;
}

function targets(event) {
  const name = toolName(event);
  const input = toolInput(event);
  const cwd = resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());
  let raw = [];
  if (FILE_TOOLS.has(name)) raw = [...nestedPaths(input), ...patchPaths(input)];
  else if (SHELL_TOOLS.has(name)) raw = shellPaths(String(input?.command ?? input?.cmd ?? input?.script ?? ""));
  return [...new Set(raw.map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

function directArtifactTarget(path, workspaceRoot) {
  const absolute = resolve(path);
  const changeDir = dirname(absolute);
  if (dirname(changeDir) !== resolve(workspaceRoot, ".specs")) return null;
  const artifact = absolute.split("/").at(-1);
  if (!ARTIFACTS.has(artifact)) return null;
  return { artifact, changeDir };
}

function canonicalPath(path) {
  let cursor = resolve(path);
  const suffix = [];
  while (true) {
    try { return resolve(realpathSync(cursor), ...suffix); } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return resolve(path);
    }
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(path);
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
}

function repositoryRoot(start) {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(resolve(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(start);
    cursor = parent;
  }
}

function artifactTarget(path, workspaceRoot) {
  return directArtifactTarget(path, workspaceRoot)
    ?? directArtifactTarget(canonicalPath(path), canonicalPath(workspaceRoot));
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
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first." });
    else findings.push(...inspection.spec.findings);
  }
  if (target.artifact === "tasks.md") {
    if (!inspection.spec) findings.push({ code: "missing-spec", message: "Create spec.md first." });
    else findings.push(...inspection.spec.findings);
    if (!inspection.plan) findings.push({ code: "missing-plan", message: "Create plan.md after spec.md." });
    else findings.push(...inspection.plan.findings);
  }
  return findings;
}

function targetPathFindings(target, inspection) {
  return inspection.findings.filter((item) => TARGET_PATH_CODES.has(item.code)
    && (item.artifact === target.artifact || item.artifact === target.changeDir.split("/").at(-1)));
}

export function evaluateHook(mode, event) {
  const workspaceRoot = repositoryRoot(event?.cwd ?? process.cwd());
  const resolvedTargets = targets(event);
  const artifacts = resolvedTargets.map((path) => artifactTarget(path, workspaceRoot)).filter(Boolean);
  if (artifacts.length === 0) return null;

  if (mode === "pre") {
    const command = SHELL_TOOLS.has(toolName(event)) ? String(toolInput(event)?.command ?? toolInput(event)?.cmd ?? "") : "";
    if (command && /(?:&&|\|\||;|\n)/u.test(command)) return deny("Compound shell writes that target .specs artifacts are not safe; write one artifact per tool call.");
    for (const target of artifacts) {
      const sameChange = artifacts.filter((candidate) => candidate.changeDir === target.changeDir).map(({ artifact }) => artifact);
      if ((target.artifact === "plan.md" && sameChange.includes("spec.md")) || (target.artifact === "tasks.md" && (sameChange.includes("spec.md") || sameChange.includes("plan.md")))) {
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
  try { event = raw.trim() ? JSON.parse(raw) : {}; } catch { return; }
  const result = evaluateHook(process.argv[2] ?? "pre", event);
  if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isEntry) await main();
