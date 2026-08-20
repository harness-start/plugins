#!/usr/bin/env node

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eventAgentId, eventCwd, eventSessionId, eventToolInput, eventToolName, isStopHookActive, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, type HookEventName } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";
import { computeLogoSubjectDigest, evaluateLogoWrite, validateLogoModel, type ContractFinding } from "../../lib/contract.js";
import { issueWriterCapability } from "../../lib/capability.js";
import { findLogoProjects, loadLogoProject, resolveWorkspaceRoot } from "../../lib/project.js";
import { evaluateLogoShell } from "../../lib/shell-policy.js";

const inputOf = (event: HookEvent) => eventToolInput(event);
const nameOf = (event: HookEvent) => eventToolName(event);
const cwdOf = (event: HookEvent) => resolve(eventCwd(event));

function principalId(event: HookEvent): string {
  const codexThreadId = process.env.HARNESS_HOST === "codex" ? process.env.CODEX_THREAD_ID : undefined;
  if (codexThreadId) return codexThreadId;
  const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
  const agentId = eventAgentId(event);
  return agentId ? `${sessionId}:agent:${agentId}` : sessionId;
}

function codexHome(capability: string): string | undefined {
  if (capability !== "logo-review" || process.env.HARNESS_HOST !== "codex") return undefined;
  return resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
}

function targetsOf(event: HookEvent): string[] {
  const input = inputOf(event);
  const extras: string[] = [];
  for (const key of ["source_path", "sourcePath", "destination_path", "destinationPath", "old_path", "oldPath", "new_path", "newPath"]) {
    if (typeof input[key] === "string") extras.push(input[key]);
  }
  return [...new Set([...extractFileTargets(event, { tools: "any" }), ...extras.map((path) => resolve(cwdOf(event), path))])];
}

function deny(reason: string) {
  return preToolDeny(`[Logo Project Delivery Guard] ${reason}`);
}

function context(eventName: HookEventName, message: string) {
  return additionalContext(eventName, message);
}

async function existingPlanTarget(cwd: string, target: string): Promise<boolean> {
  const absolute = resolve(cwd, target);
  if (!/(?:^|[\\/])artifacts[\\/]logo[\\/][^\\/]+[\\/]plan\.contract\.json$/u.test(absolute)) return false;
  try { await access(absolute); return true; } catch { return false; }
}

type ProjectFinding = ContractFinding & { artifactId: string };

function planTargetStage(plan: unknown): unknown {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan) && "targetStage" in plan
    ? (plan as { targetStage?: unknown }).targetStage
    : undefined;
}

async function findingsFor(cwd: string): Promise<{ findings: ProjectFinding[]; projectCount: number }> {
  const findings: ProjectFinding[] = [];
  const { roots } = await findLogoProjects(cwd);
  for (const root of roots) {
    const model = await loadLogoProject(root);
    const stage = planTargetStage(model.plan);
    for (const item of validateLogoModel(model, { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.artifactId.localeCompare(right.artifactId) || left.path.localeCompare(right.path));
  return { findings, projectCount: roots.length };
}

function format(findings: ProjectFinding[]): string {
  return ["[Logo Project Delivery Guard] Project contract violations", ...findings.slice(0, 100).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, vector, proof, evidence, or output and rerun the registered logo tool."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) { process.stderr.write("[Logo Project Delivery Guard] invalid hook JSON\n"); process.exitCode = 2; return; }
  if (mode === "stop" && isStopHookActive(event)) return;
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      if (await existingPlanTarget(cwd, target)) { process.stdout.write(`${JSON.stringify(deny("PLAN_STAGE_WRITER_REQUIRED: existing plan changes require project-stage.mjs"))}\n`); return; }
      const result = evaluateLogoWrite({ relativePath: resolve(cwd, target), toolName: nameOf(event) });
      if (result.decision === "deny") { process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`); return; }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const { roots } = await findLogoProjects(cwd);
      const result = evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount: roots.length });
      if (result.writer && (result.projectRoot === undefined || !roots.includes(result.projectRoot))) process.stdout.write(`${JSON.stringify(deny("PROJECT_ROOT_UNREGISTERED: registered writers require a discovered non-symlink logo project root"))}\n`);
      else if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`);
      else if (result.writer && result.projectRoot && result.argv) {
        try {
          const trustedCodexHome = codexHome(result.writer);
          await issueWriterCapability({ root: result.projectRoot, capability: result.writer, argv: result.argv, subjectDigest: computeLogoSubjectDigest(await loadLogoProject(result.projectRoot)), sessionId: principalId(event), ...(trustedCodexHome ? { codexHome: trustedCodexHome } : {}), triggerFrom: `brand-logo-production:pre:${result.writer}` });
        } catch (error) { process.stdout.write(`${JSON.stringify(deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`))}\n`); }
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findLogoProjects(cwd);
    if (roots.length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", `[Logo Project Delivery Guard] discovered ${roots.length} project(s). Use $logo-project-authoring; advice, render, preview, review, stage, and release require registered writers. session=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`))}\n`);
    return;
  }
  if (mode === "subagent") {
    const agentId = eventAgentId(event);
    if (agentId) process.stdout.write(`${JSON.stringify(context("SubagentStart", `[Logo Project Delivery Guard] trusted subagent principal=${principalId(event)}. When this subagent is explicitly assigned the independent logo review, use this exact value as reviewer.sessionId in the external review input, inspect the current digest-bound artifacts, and invoke project-review.mjs from this subagent only.`))}\n`);
    return;
  }
  const { findings } = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}\n`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stdout.write(`${JSON.stringify(stopBlock(format(findings)))}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error: unknown) => { process.stderr.write(`[Logo Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
