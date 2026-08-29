#!/usr/bin/env node

import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";

import { markSessionEngagedArtifact, sessionEngagedArtifact } from "@harness/core/artifact-paths";
import { eventCwd, eventSessionId, eventToolName, isStopHookActive, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { eventTouchesArtifact, extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import { computeDiagramSubjectDigest, evaluateDiagramWrite, findDiagramProjects, loadDiagramProject, resolveWorkspaceRoot, validateDiagramModel, type ContractFinding } from "../../lib/contract.js";
import { issueWriterCapability } from "../../lib/capability.js";
import { evaluateDiagramShell } from "../../lib/shell-policy.js";

const deny = (reason: string) => preToolDeny(`[Diagram Project Delivery Guard] ${reason}`);
const initDigest = (root: string) => createHash("sha256").update(`diagram-init:${resolve(root)}`).digest("hex");

async function runPre(event: HookEvent) {
  const cwd = resolve(eventCwd(event));
  for (const target of extractFileTargets(event, { tools: "any" })) { const result = evaluateDiagramWrite({ relativePath: relative(cwd, resolve(cwd, target)), toolName: eventToolName(event), cwd }); if (result.decision === "deny") return deny(`${result.code}: ${result.message}`); }
  const command = extractShellCommand(event); if (!command) return undefined;
  const decision = evaluateDiagramShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) }); if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
  if (decision.writer && decision.writer !== "diagram-lint" && decision.projectRoot && decision.argv) {
    try { const subjectDigest = decision.writer === "diagram-init" ? initDigest(decision.projectRoot) : computeDiagramSubjectDigest(await loadDiagramProject(decision.projectRoot)); await issueWriterCapability({ root: decision.projectRoot, capability: decision.writer, argv: decision.argv, subjectDigest, sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown", triggerFrom: `diagram-production:pre:${decision.writer}` }); }
    catch (error) { return deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return undefined;
}

type ProjectFinding = ContractFinding & { artifactId: string };
const targetStage = (plan: unknown): unknown => typeof plan === "object" && plan !== null && !Array.isArray(plan) ? (plan as Record<string, unknown>).targetStage : undefined;
async function projectFindings(cwd: string, subagent = false): Promise<ProjectFinding[]> {
  const findings: ProjectFinding[] = [];
  for (const root of await findDiagramProjects(cwd)) {
    try { const model = await loadDiagramProject(root); const requested = String(targetStage(model.plan) ?? "source"); const stage = subagent && ["review", "release"].includes(requested) ? "review" : requested; for (const item of validateDiagramModel(model, { stage })) findings.push({ artifactId: model.artifactId ?? relative(cwd, root), ...item }); }
    catch (error) { findings.push({ artifactId: relative(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) }); }
  }
  return findings;
}
const format = (findings: ProjectFinding[]) => ["[Diagram Project Delivery Guard] Project contract violations", ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`), "recovery: Fix the named source/design/output, then rerun the registered diagram writer."].join("\n");

export async function main() {
  const mode = process.argv[2] ?? "session"; const event = await readStdinJson();
  if (event.__parseError) { process.stderr.write("[Diagram Project Delivery Guard] invalid hook JSON\n"); process.exitCode = 2; return; }
  const cwd = eventCwd(event); if (mode === "pre") { writeJson(await runPre(event)); return; }
  if (mode === "session") { const roots = await findDiagramProjects(cwd); if (roots.length) writeJson(additionalContext("SessionStart", `[Diagram Project Delivery Guard] discovered ${roots.length} project(s). Use $diagram-project-authoring; generated outputs and evidence require registered writers. session=${eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"}.`)); return; }
  const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
  if (mode === "post" || mode === "failure") { if (!eventTouchesArtifact(event, "diagram")) return; markSessionEngagedArtifact({ cwd, carrier: "diagram", sessionId }); const findings = await projectFindings(cwd); if (findings.length) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings))); return; }
  if (mode === "subagent-stop") { if (!sessionEngagedArtifact({ cwd, carrier: "diagram", sessionId })) return; const findings = await projectFindings(cwd, true); if (findings.length) writeJson(additionalContext("Stop", format(findings))); return; }
  if (mode === "stop") { if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "diagram", sessionId })) return; const findings = await projectFindings(cwd); if (findings.length) writeJson(stopBlock(format(findings))); }
}
