#!/usr/bin/env node

import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eventCwd, eventSessionId, eventToolName, isStopHookActive, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { markSessionEngagedArtifact, sessionEngagedArtifact } from "@harness/core/artifact-paths";
import { eventTouchesArtifact, extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import { computePosterSubjectDigest, evaluatePosterWrite, findPosterProjects, loadPosterProject, resolveWorkspaceRoot, validatePosterModel, type ContractFinding } from "../../lib/contract.js";
import { issueWriterCapability } from "../../lib/capability.js";
import { evaluatePosterShell } from "../../lib/shell-policy.js";

const deny = (reason: string) => preToolDeny(`[Poster Project Delivery Guard] ${reason}`);
const initDigest = (root: string) => createHash("sha256").update(`poster-init:${resolve(root)}`).digest("hex");

async function runPre(event: HookEvent) {
  const cwd = resolve(eventCwd(event));
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluatePosterWrite({ relativePath: relative(cwd, resolve(cwd, target)), toolName: eventToolName(event), cwd });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }
  const command = extractShellCommand(event);
  if (!command) return undefined;
  const decision = evaluatePosterShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
  if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
  if (decision.writer && decision.writer !== "poster-lint" && decision.projectRoot && decision.argv) {
    try {
      const subjectDigest = decision.writer === "poster-init" ? initDigest(decision.projectRoot) : computePosterSubjectDigest(await loadPosterProject(decision.projectRoot));
      await issueWriterCapability({
        root: decision.projectRoot,
        capability: decision.writer,
        argv: decision.argv,
        subjectDigest,
        sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
        triggerFrom: `poster-production:pre:${decision.writer}`,
      });
    } catch (error) { return deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return undefined;
}

type ProjectFinding = ContractFinding & { artifactId: string };
const targetStage = (plan: unknown): unknown => typeof plan === "object" && plan !== null && !Array.isArray(plan) ? (plan as Record<string, unknown>).targetStage : undefined;
const reviewRequested = (plan: unknown) => ["review", "release"].includes(String(targetStage(plan)));

async function projectFindings(cwd: string, subagent = false): Promise<ProjectFinding[]> {
  const findings: ProjectFinding[] = [];
  for (const root of await findPosterProjects(cwd)) {
    try {
      const model = await loadPosterProject(root);
      const stage = subagent && reviewRequested(model.plan) ? "review" : targetStage(model.plan) ?? "source";
      for (const item of validatePosterModel(model, { stage })) findings.push({ artifactId: model.artifactId ?? relative(cwd, root), ...item });
    } catch (error) { findings.push({ artifactId: relative(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) }); }
  }
  return findings;
}

function formatFindings(findings: ProjectFinding[]) {
  return ["[Poster Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named brief/design/source/output, then rerun the registered poster writer."].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) { process.stderr.write("[Poster Project Delivery Guard] invalid hook JSON\n"); process.exitCode = 2; return; }
  const cwd = eventCwd(event);
  if (mode === "pre") { writeJson(await runPre(event)); return; }
  if (mode === "session") {
    const roots = await findPosterProjects(cwd);
    if (roots.length) writeJson(additionalContext("SessionStart", `[Poster Project Delivery Guard] discovered ${roots.length} project(s). Use $poster-project-authoring; generated SVG/PNG, evidence, review, and release files require registered writers. session=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "poster")) return;
    markSessionEngagedArtifact({ cwd, carrier: "poster", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" });
    const findings = await projectFindings(cwd);
    if (findings.length) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "poster", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings(cwd, true);
    if (findings.length) writeJson(additionalContext("Stop", formatFindings(findings)));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "poster", sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown" })) return;
    const findings = await projectFindings(cwd);
    if (findings.length) writeJson(stopBlock(formatFindings(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error: unknown) => { process.stderr.write(`[Poster Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
