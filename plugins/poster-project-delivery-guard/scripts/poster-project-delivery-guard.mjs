#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluatePosterWrite, validatePosterModel } from "./lib/contract.mjs";
import { evaluatePosterShell } from "./lib/shell-policy.mjs";

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try { return raw.trim() ? JSON.parse(raw) : {}; } catch { return { __parseError: true }; }
}

const inputOf = (event) => event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
const nameOf = (event) => event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
const cwdOf = (event) => resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());

function objectTargets(input) {
  if (!input || typeof input !== "object") return [];
  const targets = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) targets.push(input[key]);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) targets.push(...objectTargets(edit));
  return targets;
}

function targetsOf(event) {
  const input = inputOf(event);
  const targets = objectTargets(input);
  for (const value of [input?.patch, input?.input]) if (typeof value === "string") {
    for (const match of value.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim());
  }
  return [...new Set(targets)];
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[Poster Project Delivery Guard] ${reason}` } };
}

function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}

function resolveWorkspaceRoot(cwd) {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === "poster" && basename(dirname(dirname(current))) === "artifacts") {
      return dirname(dirname(dirname(current)));
    }
    current = dirname(current);
  }
  return resolve(cwd);
}

async function discover(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const root = join(workspaceRoot, "artifacts", "poster");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name))
      .slice(0, 32)
      .map((entry) => join(root, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function collect(root, directory, files, digests, bytesMap) {
  if (Object.keys(files).length >= 2048) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, files, digests, bytesMap);
    else if (entry.isFile()) {
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const bytes = await readFile(absolute);
      files[filePath] = bytes.toString("utf8");
      bytesMap[filePath] = bytes;
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

async function findingsFor(cwd) {
  const findings = [];
  for (const root of await discover(cwd)) {
    const files = {};
    const digests = {};
    const bytes = {};
    await collect(root, root, files, digests, bytes);
    if (!("plan.contract.json" in files)) continue;
    let plan = null;
    let project = null;
    try { plan = JSON.parse(files["plan.contract.json"]); } catch {}
    try { project = JSON.parse(files["poster.project.json"]); } catch {}
    const model = { artifactId: basename(root), files, digests, bytes, plan, project };
    for (const item of validatePosterModel(model, { stage: plan?.targetStage ?? "source" })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return findings;
}

function format(findings) {
  return ["[Poster Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named variant, layer, proof, or output and rerun the registered poster tool."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readEvent();
  if (event.__parseError) return;
  const cwd = cwdOf(event);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const result = evaluatePosterWrite({
        relativePath: relative(cwd, resolve(cwd, target)),
        toolName: nameOf(event),
        cwd,
      });
      if (result.decision === "deny") { process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`); return; }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    if (command) {
      const result = evaluatePosterShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`);
      }
    }
    return;
  }
  const findings = await findingsFor(cwd);
  if (mode === "session") {
    if ((await discover(cwd)).length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", "[Poster Project Delivery Guard] active; generated outputs require registered writers."))}\n`);
  } else if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}\n`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stderr.write(`${format(findings)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { process.stderr.write(`[Poster Project Delivery Guard] ${error.message}\n`); process.exitCode = 2; });
