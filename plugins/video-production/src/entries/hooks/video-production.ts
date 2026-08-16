#!/usr/bin/env node

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eventCwd, eventSessionId, eventToolName, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson, type HookEventName } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";
import { evaluateVideoWrite, validateVideoModel } from "../../lib/contract.js";
import { issueWriterCapability } from "../../lib/capability.js";
import { findVideoProjects, loadVideoProject, resolveWorkspaceRoot } from "../../lib/project.js";
import { evaluateVideoShell } from "../../lib/shell-policy.js";

type ProjectFinding = {
  artifactId?: string | undefined;
  code: string;
  path: string;
  message: string;
};

const nameOf = (event: HookEvent) => eventToolName(event);
const cwdOf = (event: HookEvent) => resolve(eventCwd(event));
const sessionOf = (event: HookEvent) => eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";

function targetsOf(event: HookEvent) {
  return extractFileTargets(event, { tools: "any" });
}

function deny(reason: string) {
  return preToolDeny(`[Video Project Delivery Guard] ${reason}`);
}

function context(eventName: HookEventName, message: string) {
  return additionalContext(eventName, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function findingsFor(cwd: string) {
  const findings: ProjectFinding[] = [];
  const { workspaceRoot, roots } = await findVideoProjects(cwd);
  for (const root of roots) {
    const model = await loadVideoProject(root);
    const artifactPath = relative(workspaceRoot, root).replaceAll("\\", "/");
    if (!(model.files && "plan.contract.json" in model.files)) {
      findings.push({ artifactId: model.artifactId, code: "PLAN_CONTRACT_MISSING", path: `${artifactPath}/plan.contract.json`, message: "plan.contract.json is required to select a closure stage" });
    }
    const stage = isRecord(model.plan) && typeof model.plan.targetStage === "string" ? model.plan.targetStage : undefined;
    for (const item of validateVideoModel(model, stage === undefined ? {} : { stage })) findings.push({ artifactId: model.artifactId, ...item });
  }
  return { findings, projectCount: roots.length };
}

function format(findings: ProjectFinding[]) {
  return ["[Video Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named contract, proof, evidence, or output and rerun the registered video tool."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) { process.stderr.write("[Video Project Delivery Guard] invalid hook JSON\n"); process.exitCode = 2; return; }
  const cwd = cwdOf(event);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const absolutePath = resolve(cwd, target);
      const result = evaluateVideoWrite({ relativePath: absolutePath, toolName: nameOf(event) });
      if (result.decision === "deny") { process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`); return; }
    }
    const command = extractShellCommand(event) ?? "";
    if (command) {
      const result = evaluateVideoShell({ command, cwd, workspaceRoot });
      if (result.decision === "deny") process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`);
      else if (result.writer && result.writer !== "video-lint" && result.projectRoot && result.argv) {
        try {
          await issueWriterCapability({ root: result.projectRoot, capability: result.writer, argv: result.argv, sessionId: sessionOf(event), triggerFrom: `video-production:pre:${result.writer}` });
        } catch (error) {
          const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
          process.stdout.write(`${JSON.stringify(deny(`WRITER_CAPABILITY_DENIED: ${message}`))}\n`);
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
    writeJson(stopBlock(format(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    process.stderr.write(`[Video Project Delivery Guard] ${message}\n`);
    process.exitCode = 2;
  });
}
