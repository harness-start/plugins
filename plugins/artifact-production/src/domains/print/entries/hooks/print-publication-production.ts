#!/usr/bin/env node

import { basename, dirname, relative, resolve } from "node:path";

import { findCarrierProjects, collectProjectFiles } from "@harness/core/artifact-scan";
import { markSessionEngagedArtifact, resolveWorkspaceRoot, sessionEngagedArtifact } from "@harness/core/artifact-paths";
import { evaluateRegisteredWriter, expandKnownPluginRoot, parseShellWords } from "@harness/core/artifact-shell";
import { eventCwd, eventSessionId, eventToolName, isStopHookActive, readStdinJson } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { eventTouchesArtifact, extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import { evaluatePrintWrite, validatePrintModel, type ContractFinding } from "../../lib/contract.js";
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? dirname(resolve(process.argv[1] ?? process.cwd())),
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);
const READ_ONLY_COMMANDS = new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);

function deny(reason: string) {
  return preToolDeny(`[Print Project Delivery Guard] ${reason}`);
}

function isReadOnlyCommand(command: string): boolean {
  const words = parseShellWords(expandKnownPluginRoot(command));
  if (!words?.length) return false;
  const executable = basename(words[0] ?? "");
  if (!READ_ONLY_COMMANDS.has(executable)) return false;
  if (executable === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (executable === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (executable === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(word))) return false;
  if (executable === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}

type ProjectFinding = ContractFinding & { artifactId: string };

function targetStageOf(plan: unknown): unknown {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan)
    ? (plan as Record<string, unknown>).targetStage
    : undefined;
}

async function findingsFor(cwd: string): Promise<ProjectFinding[]> {
  const findings: ProjectFinding[] = [];
  const { roots } = await findCarrierProjects(cwd, "print");
  for (const root of roots) {
    const collected = await collectProjectFiles(root, { maxFiles: 2048 });
    if (!("plan.contract.json" in collected.files)) continue;
    let plan: unknown = null;
    let project: unknown = null;
    try { plan = JSON.parse(collected.files["plan.contract.json"] ?? ""); } catch {}
    try { project = JSON.parse(collected.files["print.project.json"] ?? ""); } catch {}
    const model = { artifactId: basename(root), files: collected.files, digests: collected.digests, plan, project };
    for (const item of validatePrintModel(model, { stage: targetStageOf(plan) ?? "source" })) {
      findings.push({ artifactId: model.artifactId, ...item });
    }
  }
  return findings;
}

function format(findings: ProjectFinding[]): string {
  return [
    "[Print Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Fix the named variant, layer, proof, or output and rerun the registered print tool.",
  ].join("\n");
}

export async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = eventCwd(event);
  if (mode === "pre") {
    for (const target of extractFileTargets(event, { tools: "any" })) {
      const result = evaluatePrintWrite({
        relativePath: relative(cwd, resolve(cwd, target)),
        toolName: eventToolName(event),
        cwd,
      });
      if (result.decision === "deny") {
        writeJson(deny(`${result.code}: ${result.message}`));
        return;
      }
    }
    const command = extractShellCommand(event) ?? "";
    const workspaceRoot = resolveWorkspaceRoot(cwd, "print");
    const cwdInScope = /(?:^|[\\/])artifacts[\\/]print[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
    const inScope = /artifacts[\\/]print[\\/]/u.test(command) || cwdInScope;
    const approved = evaluateRegisteredWriter({
      command,
      cwd,
      workspaceRoot,
      carrier: "print",
      writers: ["project-lint.mjs", "project-release.mjs"],
      toolDirectory: resolve(PLUGIN_DIRECTORY, "dist", "cli"),
      resource: "print",
    });
    if (inScope && !approved.ok && !isReadOnlyCommand(command)) {
      writeJson(deny("UNKNOWN_MUTATION_SHELL: print scope permits only read-only commands or an exact registered writer invocation"));
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findCarrierProjects(cwd, "print");
    if (roots.length > 0) writeJson(additionalContext("SessionStart", "[Print Project Delivery Guard] active; generated outputs require registered writers."));
    return;
  }
  const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
  if (mode === "post" || mode === "failure") {
    if (!eventTouchesArtifact(event, "print")) return;
    markSessionEngagedArtifact({ cwd, carrier: "print", sessionId });
  }
  if (mode === "stop" && isStopHookActive(event)) return;
  if ((mode === "stop" || mode === "subagent-stop") && !sessionEngagedArtifact({ cwd, carrier: "print", sessionId })) return;
  if (mode === "subagent-stop" || mode === "post" || mode === "failure" || mode === "stop") {
    const findings = await findingsFor(cwd);
    if (mode === "post" || mode === "failure") {
      if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)));
    } else if (mode === "subagent-stop") {
      if (findings.length > 0) writeJson(additionalContext("Stop", format(findings)));
    } else if (findings.length > 0) {
      writeJson(stopBlock(format(findings)));
    }
  }
}
