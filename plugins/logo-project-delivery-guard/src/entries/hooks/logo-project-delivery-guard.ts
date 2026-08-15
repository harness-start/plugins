#!/usr/bin/env node

import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLogoWrite, validateLogoModel } from "../../lib/contract.js";
import { findLogoProjects, loadLogoProject, resolveWorkspaceRoot } from "../../lib/project.js";
import { evaluateLogoShell } from "../../lib/shell-policy.js";

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
  for (const key of [
    "file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath",
    "source_path", "sourcePath", "destination_path", "destinationPath", "old_path", "oldPath", "new_path", "newPath",
  ]) if (typeof input[key] === "string") targets.push(input[key]);
  if (Array.isArray(input.edits)) for (const edit of input.edits) targets.push(...objectTargets(edit));
  return targets;
}

function targetsOf(event) {
  const input = inputOf(event);
  const targets = objectTargets(input);
  for (const value of [input?.patch, input?.input, typeof input === "string" ? input : null]) if (typeof value === "string") {
    for (const match of value.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim());
    for (const match of value.matchAll(/^\*\*\*\s+Move to:\s+(.+)$/gmu)) targets.push(match[1].trim());
  }
  return [...new Set(targets)];
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[Logo Project Delivery Guard] ${reason}` } };
}

function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}

function stopBlock(reason) {
  return { decision: "block", reason };
}

async function existingPlanTarget(cwd, target) {
  const absolute = resolve(cwd, target);
  if (!/(?:^|[\\/])artifacts[\\/]logo[\\/][^\\/]+[\\/]plan\.contract\.json$/u.test(absolute)) return false;
  try { await access(absolute); return true; } catch { return false; }
}

async function findingsFor(cwd) {
  const findings = [];
  const { roots } = await findLogoProjects(cwd);
  for (const root of roots) {
    const model = await loadLogoProject(root);
    const stage = model.plan?.targetStage;
    for (const item of validateLogoModel(model, { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.artifactId.localeCompare(right.artifactId) || left.path.localeCompare(right.path));
  return { findings, projectCount: roots.length };
}

function format(findings) {
  return ["[Logo Project Delivery Guard] Project contract violations", ...findings.slice(0, 100).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, vector, proof, evidence, or output and rerun the registered logo tool."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readEvent();
  if (event.__parseError) { process.stderr.write("[Logo Project Delivery Guard] invalid hook JSON\n"); process.exitCode = 2; return; }
  if (mode === "stop" && (event?.stop_hook_active === true || event?.stopHookActive === true)) return;
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      if (await existingPlanTarget(cwd, target)) { process.stdout.write(`${JSON.stringify(deny("PLAN_STAGE_WRITER_REQUIRED: existing plan changes require project-stage.mjs"))}\n`); return; }
      const result = evaluateLogoWrite({ relativePath: resolve(cwd, target), toolName: nameOf(event) });
      if (result.decision === "deny") { process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`); return; }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    if (command) {
      const { roots } = await findLogoProjects(cwd);
      const result = evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount: roots.length });
      if (result.writer && !roots.includes(result.projectRoot)) process.stdout.write(`${JSON.stringify(deny("PROJECT_ROOT_UNREGISTERED: registered writers require a discovered non-symlink logo project root"))}\n`);
      else if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`);
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findLogoProjects(cwd);
    if (roots.length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Logo Project Delivery Guard] discovered ${roots.length} project(s); generated outputs require project-render and release requires project-release.`))}\n`);
    return;
  }
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}\n`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stdout.write(`${JSON.stringify(stopBlock(format(findings)))}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { process.stderr.write(`[Logo Project Delivery Guard] ${error.message}\n`); process.exitCode = 2; });
