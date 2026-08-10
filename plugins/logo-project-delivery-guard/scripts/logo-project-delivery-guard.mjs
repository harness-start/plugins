#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLogoWrite, validateLogoModel } from "./lib/contract.mjs";

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try { return raw.trim() ? JSON.parse(raw) : {}; } catch { return { __parseError: true }; }
}

const inputOf = (event) => event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
const nameOf = (event) => event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
const cwdOf = (event) => resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());

function targetsOf(event) {
  const input = inputOf(event);
  const targets = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile"]) if (typeof input?.[key] === "string") targets.push(input[key]);
  for (const value of [input?.patch, input?.input]) if (typeof value === "string") {
    for (const match of value.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim());
  }
  return [...new Set(targets)];
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[Logo Project Delivery Guard] ${reason}` } };
}

function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}

async function discover(cwd) {
  const root = join(cwd, "artifacts", "logo");
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

async function collect(root, directory, files, digests) {
  if (Object.keys(files).length >= 2048) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, absolute, files, digests);
    else if (entry.isFile()) {
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      const bytes = await readFile(absolute);
      files[filePath] = bytes.toString("utf8");
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

async function findingsFor(cwd) {
  const findings = [];
  for (const root of await discover(cwd)) {
    const files = {};
    const digests = {};
    await collect(root, root, files, digests);
    if (!("plan.contract.json" in files)) continue;
    let plan = null;
    let project = null;
    try { plan = JSON.parse(files["plan.contract.json"]); } catch {}
    try { project = JSON.parse(files["logo.project.json"]); } catch {}
    const model = { artifactId: basename(root), files, digests, plan, project };
    for (const item of validateLogoModel(model, { stage: plan?.targetStage ?? "source" })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return findings;
}

function format(findings) {
  return ["[Logo Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named variant, layer, proof, or output and rerun the registered logo tool."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readEvent();
  if (event.__parseError) return;
  const cwd = cwdOf(event);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const result = evaluateLogoWrite({ relativePath: relative(cwd, resolve(cwd, target)), toolName: nameOf(event) });
      if (result.decision === "deny") { process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`); return; }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    const cwdInScope = /(?:^|[\\/])artifacts[\\/]logo[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
    const mutates = (/artifacts[\\/]logo[\\/]/u.test(command) || cwdInScope) && (/[>]{1,2}/u.test(command) || /(?:^|\s)(?:cp|mv|rm|touch|tee|node|npm|npx|python\d*)\b/u.test(command));
    const compoundShell = /(?:&&|\|\||[;&|><`\n]|\$\()/u.test(command);
    const approvedWrapper = /logo-project-delivery-guard[\\/]scripts[\\/]tools[\\/](?:project-lint|project-release|project-preview|project-validate)\.mjs\b/u.test(command) && !compoundShell;
    if (mutates && !approvedWrapper) process.stdout.write(`${JSON.stringify(deny("UNKNOWN_MUTATION_SHELL: logo mutations require a registered wrapper"))}\n`);
    return;
  }
  const findings = await findingsFor(cwd);
  if (mode === "session") {
    if ((await discover(cwd)).length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", "[Logo Project Delivery Guard] active; generated outputs require registered writers."))}\n`);
  } else if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}\n`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stderr.write(`${format(findings)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { process.stderr.write(`[Logo Project Delivery Guard] ${error.message}\n`); process.exitCode = 2; });
