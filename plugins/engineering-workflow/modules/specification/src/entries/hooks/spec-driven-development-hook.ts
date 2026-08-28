#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eventCwd, eventToolName, isRecord, type HookEvent } from "@harness/core/hook-event";
import { extractFileTargets, extractShellCommand, isShellTool } from "@harness/core/hook-targets";

import { formatFindings, inspectChange, type ArtifactFinding, type ArtifactName, type ChangeInspection } from "../../lib/artifacts.js";

const ARTIFACTS = new Set<string>(["spec.md", "plan.md", "tasks.md"]);
const TARGET_PATH_CODES = new Set(["invalid-change-name", "invalid-spec-root", "symlink-artifact", "artifact-read-error"]);

type ArtifactTarget = {
  artifact: ArtifactName;
  changeDir: string;
};

function isArtifactName(value: string | undefined): value is ArtifactName {
  return value !== undefined && ARTIFACTS.has(value);
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return isRecord(error) && typeof error.code === "string";
}

function targets(event: HookEvent): string[] {
  const core = extractFileTargets(event, { includeShellWrites: true });
  if (!isShellTool(eventToolName(event))) return core;
  const cwd = resolve(eventCwd(event));
  const extras: string[] = [];
  const command = extractShellCommand(event) ?? "";
  for (const match of command.matchAll(/\b(?:cp|mv|install)\b(?:\s+-[^\s]+)*\s+[^\s;&|]+\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    const raw = String(match[1] ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (raw && !raw.startsWith("-")) extras.push(isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw.replace(/^\.\//u, "")));
  }
  return [...new Set([...core, ...extras])];
}

function directArtifactTarget(path: string, workspaceRoot: string): ArtifactTarget | null {
  const absolute = resolve(path);
  const changeDir = dirname(absolute);
  if (dirname(changeDir) !== resolve(workspaceRoot, ".specs")) return null;
  const artifact = absolute.split("/").at(-1);
  if (!isArtifactName(artifact)) return null;
  return { artifact, changeDir };
}

function canonicalPath(path: string): string {
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try { return resolve(realpathSync(cursor), ...suffix); } catch (error: unknown) {
      if (!isErrno(error) || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) return resolve(path);
    }
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(path);
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
}

function repositoryRoot(start: string): string {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(resolve(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(start);
    cursor = parent;
  }
}

function artifactTarget(path: string, workspaceRoot: string): ArtifactTarget | null {
  return directArtifactTarget(path, workspaceRoot)
    ?? directArtifactTarget(canonicalPath(path), canonicalPath(workspaceRoot));
}

function deny(reason: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `[SDD Workflow] ${reason}` } };
}

function diagnostic(text: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `[SDD Workflow] ${text}` } };
}

function upstreamFindings(target: ArtifactTarget, inspection: ChangeInspection): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];
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

function targetPathFindings(target: ArtifactTarget, inspection: ChangeInspection): ArtifactFinding[] {
  return inspection.findings.filter((item) => TARGET_PATH_CODES.has(item.code)
    && (item.artifact === target.artifact || item.artifact === target.changeDir.split("/").at(-1)));
}

export function evaluateHook(mode: string, event: HookEvent | null | undefined): Record<string, unknown> | null {
  const rawCwd = event?.cwd;
  const workspaceRoot = repositoryRoot(typeof rawCwd === "string" ? rawCwd : rawCwd == null ? process.cwd() : String(rawCwd));
  const resolvedTargets = targets(event ?? {});
  const artifacts = resolvedTargets.map((path) => artifactTarget(path, workspaceRoot)).filter((target): target is ArtifactTarget => target !== null);
  if (artifacts.length === 0) return null;

  if (mode === "pre") {
    const command = isShellTool(eventToolName(event ?? {})) ? String(extractShellCommand(event ?? {}) ?? "") : "";
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
    const messages: string[] = [];
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

async function main(): Promise<void> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event: HookEvent;
  try {
    const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
    event = isRecord(parsed) ? parsed : {};
  } catch { return; }
  const result = evaluateHook(process.argv[2] ?? "pre", event);
  if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isEntry) await main();
