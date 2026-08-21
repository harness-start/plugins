#!/usr/bin/env node

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { eventCwd, eventSessionId, eventToolName, isStopHookActive, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { sessionEngagedArtifact } from "@harness/core/artifact-paths";
import { eventTouchesArtifact, extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import {
  computeTrainingSubjectDigest,
  evaluateTrainingWrite,
  findTrainingProjects,
  loadTrainingProject,
  resolveWorkspaceRoot,
  validateTrainingModel,
  type ContractFinding,
} from "../../lib/contract.js";
import { issueWriterCapability } from "../../lib/capability.js";
import { evaluateTrainingShell } from "../../lib/shell-policy.js";

const LABEL = "[Training Program Delivery Guard]";

function deny(reason: string) {
  return preToolDeny(`${LABEL} ${reason}`);
}

async function runPre(event: HookEvent) {
  const cwd = resolve(eventCwd(event));
  const toolName = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const decision = evaluateTrainingWrite({ relativePath: relative(cwd, resolve(cwd, target)), toolName, cwd });
    if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
  }

  const command = extractShellCommand(event);
  if (!command) return undefined;
  const decision = evaluateTrainingShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd) });
  if (decision.decision === "deny") return deny(`${decision.code}: ${decision.message}`);
  if (decision.writer && ["training-render", "training-review", "training-release"].includes(decision.writer) && decision.projectRoot && decision.argv) {
    try {
      const model = await loadTrainingProject(decision.projectRoot);
      await issueWriterCapability({
        root: decision.projectRoot,
        capability: decision.writer,
        argv: decision.argv,
        subjectDigest: computeTrainingSubjectDigest(model),
        sessionId: eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown",
        triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM || `training-program-design:pre:${decision.writer}`,
      });
    } catch (error) {
      return deny(`WRITER_CAPABILITY_DENIED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return undefined;
}

type ProjectFinding = ContractFinding & { artifactId: string };

function targetStage(plan: unknown): unknown {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan)
    ? (plan as Record<string, unknown>).targetStage
    : undefined;
}

function feedbackStage(files: Record<string, string>) {
  if ("receipt.release.json" in files) return "release";
  if ("review.training.json" in files) return "review";
  if ("evidence.render.json" in files || Object.keys(files).some((path) => path.startsWith("dist/"))) return "materials";
  if (".training-delivery-journal.json" in files) return "brief";
  return null;
}

async function projectFindings(cwd: string, forceStage?: unknown, { generatedOnly = false } = {}): Promise<ProjectFinding[]> {
  const findings: ProjectFinding[] = [];
  for (const root of await findTrainingProjects(cwd)) {
    try {
      const model = await loadTrainingProject(root);
      const currentStage = generatedOnly ? feedbackStage(model.files) : forceStage ?? targetStage(model.plan) ?? "brief";
      if (!currentStage) continue;
      for (const item of validateTrainingModel(model, { stage: currentStage })) {
        findings.push({ artifactId: model.artifactId, ...item });
      }
    } catch (error) {
      findings.push({ artifactId: relative(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return findings;
}

function formatFindings(findings: ProjectFinding[]) {
  const facts = findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`);
  return [
    `${LABEL} stage contract is incomplete.`,
    "observedFacts:",
    ...facts,
    "harm: The requested training stage is not supported by current source, evidence, review, or receipt state.",
    "unblockWhen: Every listed violation is resolved and the validator passes at plan.contract.json targetStage.",
    "recovery: Edit only plan.contract.json or training-package.json, then use the registered lint/render/review/release wrapper in order.",
  ].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) {
    if (mode === "pre") writeJson(deny("HOOK_INPUT_INVALID: invalid hook JSON; refusing a possibly protected mutation"));
    else process.stderr.write(`${LABEL} invalid hook JSON; non-mutating hook failed open\n`);
    return;
  }
  const cwd = eventCwd(event);

  if (mode === "pre") {
    writeJson(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findTrainingProjects(cwd);
    const context = roots.length > 0
      ? `${LABEL} discovered ${roots.length} active training project(s). Follow the bundled training-program-design Skill; generated materials, review, and release evidence require registered writers.`
      : `${LABEL} no training project is active. Route to the bundled training-program-design Skill only when the user asks to design or adapt training; otherwise take no action.`;
    writeJson(additionalContext("SessionStart", context));
    return;
  }
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "training")) return;
    const findings = await projectFindings(cwd, undefined, { generatedOnly: true });
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "subagent-stop") {
    if (!sessionEngagedArtifact({ cwd, carrier: "training" })) return;
    const findings = await projectFindings(cwd, "review");
    if (findings.length > 0) writeJson(additionalContext("Stop", `${formatFindings(findings)}\nreviewBoundary: Reviewer output is advisory; it has no release authority.`));
    return;
  }
  if (mode === "stop") {
    if (isStopHookActive(event) || !sessionEngagedArtifact({ cwd, carrier: "training" })) return;
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = `${LABEL} ${error instanceof Error ? error.message : String(error)}`;
    if ((process.argv[2] ?? "session") === "pre") writeJson(deny(`HOOK_FAILURE: ${message}`));
    else process.stderr.write(`${message}\n`);
  });
}
