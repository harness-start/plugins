#!/usr/bin/env node

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findCarrierProjects } from "@harness/core/artifact-scan";
import { eventCwd, eventSessionId, eventToolName, isStopHookActive, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { markSessionEngagedArtifact, sessionEngagedArtifact } from "@harness/core/artifact-paths";
import { eventTouchesArtifact, extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";
import { isGenericMutationCommand } from "@harness/core/path-protect";

import {
  computePptxSubjectDigest,
  evaluatePptxWrite,
  findPptxProjects,
  loadPptxProject,
  resolveWorkspaceRoot,
  validatePptxModel,
  type ContractFinding,
} from "../../lib/contract.js";
import { issueWriterCapability } from "../../lib/capability.js";
import { evaluatePptxShell } from "../../lib/shell-policy.js";

function deny(reason: string) {
  return preToolDeny(`[PPTX Project Delivery Guard] ${reason}`);
}

async function runPre(event: HookEvent) {
  const cwd = resolve(eventCwd(event));
  const name = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluatePptxWrite({
      relativePath: relative(cwd, resolve(cwd, target)),
      toolName: name,
      cwd,
    });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }

  const command = extractShellCommand(event);
  if (command) {
    const activeProjectCount = isGenericMutationCommand(command) ? (await findPptxProjects(cwd)).length : 0;
    const decision = evaluatePptxShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd), activeProjectCount });
    if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
    if (decision.writer && !["pptx-init", "pptx-lint"].includes(decision.writer) && decision.projectRoot && decision.argv) {
      try {
        const model = await loadPptxProject(decision.projectRoot);
        await issueWriterCapability({
          root: decision.projectRoot,
          capability: decision.writer,
          argv: decision.argv,
          subjectDigest: computePptxSubjectDigest(model),
          sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
          triggerFrom: `presentation-production:pre:${decision.writer}`,
        });
      } catch (error) {
        return deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return undefined;
}

type ProjectFinding = ContractFinding & { artifactId: string };

function planTargetStage(plan: unknown): unknown {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan)
    ? (plan as Record<string, unknown>).targetStage
    : undefined;
}

async function projectFindings(cwd: string, forceStage?: unknown): Promise<ProjectFinding[]> {
  const findings: ProjectFinding[] = [];
  const roots = typeof findPptxProjects === "function" ? await findPptxProjects(cwd) : (await findCarrierProjects(cwd, "pptx")).roots;
  for (const root of roots) {
    try {
      const model = await loadPptxProject(root);
      const stage = forceStage ?? planTargetStage(model.plan) ?? "source";
      for (const item of validatePptxModel(model, { stage })) {
        findings.push({ artifactId: model.artifactId ?? relative(cwd, root), ...item });
      }
    } catch (error: unknown) {
      findings.push({ artifactId: relative(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}

function formatFindings(findings: ProjectFinding[]): string {
  return [
    "[PPTX Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Fix the named source/manifest/output, then run the registered validator or writer again.",
  ].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) { process.stderr.write("[PPTX Project Delivery Guard] invalid hook JSON\n"); process.exitCode = 2; return; }
  const cwd = eventCwd(event);

  if (mode === "pre") {
    writeJson(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findPptxProjects(cwd);
    if (roots.length > 0) writeJson(additionalContext("SessionStart", `[PPTX Project Delivery Guard] discovered ${roots.length} project(s). Follow the bundled pptx-deck-authoring orchestrator; generated outputs require registered init/lint/render/probe/review/release writers; host session id=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "pptx")) return;
    markSessionEngagedArtifact({ cwd, carrier: "pptx", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" });
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "pptx", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings(cwd, "review");
    if (findings.length > 0) writeJson(additionalContext("Stop", formatFindings(findings)));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "pptx", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`[PPTX Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
