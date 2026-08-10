#!/usr/bin/env node

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateVideoWrite, validateVideoModel } from "./lib/contract.mjs";
import { issueWriterCapability } from "./lib/capability.mjs";
import { findVideoProjects, loadVideoProject, resolveWorkspaceRoot } from "./lib/project.mjs";
import { evaluateVideoShell } from "./lib/shell-policy.mjs";

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try { return raw.trim() ? JSON.parse(raw) : {}; } catch { return { __parseError: true }; }
}

const inputOf = (event) => event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
const nameOf = (event) => event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
const cwdOf = (event) => resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());
const sessionOf = (event) => event?.session_id ?? event?.sessionId ?? event?.context?.session_id ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown";

function objectTargets(input) {
  if (!input || typeof input !== "object") return [];
  const targets = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string") targets.push(input[key]);
  }
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
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[Video Project Delivery Guard] ${reason}` } };
}

function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}

async function findingsFor(cwd) {
  const findings = [];
  const { workspaceRoot, roots } = await findVideoProjects(cwd);
  for (const root of roots) {
    const model = await loadVideoProject(root);
    const artifactPath = relative(workspaceRoot, root).replaceAll("\\", "/");
    if (!("plan.contract.json" in model.files)) {
      findings.push({ artifactId: model.artifactId, code: "PLAN_CONTRACT_MISSING", path: `${artifactPath}/plan.contract.json`, message: "plan.contract.json is required to select a closure stage" });
    }
    const stage = model.plan?.targetStage;
    for (const item of validateVideoModel(model, { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return { findings, projectCount: roots.length };
}

function format(findings) {
  return ["[Video Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, proof, evidence, or output and rerun the registered video tool."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readEvent();
  if (event.__parseError) { process.stderr.write("[Video Project Delivery Guard] invalid hook JSON\n"); process.exitCode = 2; return; }
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const absolutePath = resolve(cwd, target);
      const result = evaluateVideoWrite({ relativePath: absolutePath, toolName: nameOf(event) });
      if (result.decision === "deny") { process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`); return; }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    if (command) {
      const result = evaluateVideoShell({ command, cwd, workspaceRoot });
      if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`);
      else if (result.writer && result.writer !== "video-lint") {
        try {
          await issueWriterCapability({ root: result.projectRoot, capability: result.writer, argv: result.argv, sessionId: sessionOf(event), triggerFrom: `video-project-delivery-guard:pre:${result.writer}` });
        } catch (error) {
          process.stdout.write(`${JSON.stringify(deny(`WRITER_CAPABILITY_DENIED: ${error.message}`))}\n`);
        }
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findVideoProjects(cwd);
    const projectCount = roots.length;
    if (projectCount > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Video Project Delivery Guard] discovered ${projectCount} project(s); generated outputs require registered writers; host session id=${sessionOf(event)}.`))}\n`);
    return;
  }
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}\n`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stderr.write(`${format(findings)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { process.stderr.write(`[Video Project Delivery Guard] ${error.message}\n`); process.exitCode = 2; });
