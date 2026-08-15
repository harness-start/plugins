#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eventCwd, eventToolName, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson, type HookEventName } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";
import { evaluatePosterWrite, validatePosterModel, type BytesMap, type ContractFinding, type DigestMap, type FileMap } from "../../lib/contract.js";
import { evaluatePosterShell } from "../../lib/shell-policy.js";

const nameOf = (event: HookEvent) => eventToolName(event);
const cwdOf = (event: HookEvent) => resolve(eventCwd(event));

function targetsOf(event: HookEvent): string[] {
  return extractFileTargets(event, { tools: "any" });
}

function deny(reason: string) {
  return preToolDeny(`[Poster Project Delivery Guard] ${reason}`);
}

function context(eventName: HookEventName, message: string) {
  return additionalContext(eventName, message);
}

function resolveWorkspaceRoot(cwd: string): string {
  let current = resolve(cwd);
  while (current !== dirname(current)) {
    if (basename(dirname(current)) === "poster" && basename(dirname(dirname(current))) === "artifacts") {
      return dirname(dirname(dirname(current)));
    }
    current = dirname(current);
  }
  return resolve(cwd);
}

async function discover(cwd: string): Promise<string[]> {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const root = join(workspaceRoot, "artifacts", "poster");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name))
      .slice(0, 32)
      .map((entry) => join(root, entry.name));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function collect(root: string, directory: string, files: FileMap, digests: DigestMap, bytesMap: BytesMap): Promise<void> {
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

type ProjectFinding = ContractFinding & { artifactId: string };

function targetStageOf(plan: unknown): unknown {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan)
    ? (plan as Record<string, unknown>).targetStage
    : undefined;
}

async function findingsFor(cwd: string): Promise<ProjectFinding[]> {
  const findings: ProjectFinding[] = [];
  for (const root of await discover(cwd)) {
    const files: FileMap = {};
    const digests: DigestMap = {};
    const bytes: BytesMap = {};
    await collect(root, root, files, digests, bytes);
    if (!("plan.contract.json" in files)) continue;
    let plan: unknown = null;
    let project: unknown = null;
    try { plan = JSON.parse(String(files["plan.contract.json"] ?? "")); } catch {}
    try { project = JSON.parse(String(files["poster.project.json"] ?? "")); } catch {}
    const model = { artifactId: basename(root), files, digests, bytes, plan, project };
    for (const item of validatePosterModel(model, { stage: targetStageOf(plan) ?? "source" })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return findings;
}

function format(findings: ProjectFinding[]): string {
  return ["[Poster Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named variant, layer, proof, or output and rerun the registered poster tool."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
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
    const command = extractShellCommand(event) ?? "";
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
    writeJson(stopBlock(format(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error: unknown) => { process.stderr.write(`[Poster Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
