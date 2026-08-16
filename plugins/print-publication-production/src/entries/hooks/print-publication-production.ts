#!/usr/bin/env node

import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findCarrierProjects, collectProjectFiles } from "@harness/core/artifact-scan";
import { resolveWorkspaceRoot } from "@harness/core/artifact-paths";
import { evaluateRegisteredWriter } from "@harness/core/artifact-shell";
import { eventCwd, eventToolName, readStdinJson } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import { evaluatePrintWrite, validatePrintModel, type ContractFinding } from "../../lib/contract.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);

function deny(reason: string) {
  return preToolDeny(`[Print Project Delivery Guard] ${reason}`);
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

async function main() {
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
    const mutates = (/artifacts[\\/]print[\\/]/u.test(command) || cwdInScope)
      && (/[>]{1,2}/u.test(command) || /(?:^|\s)(?:cp|mv|rm|touch|tee|node|npm|npx|python\d*)\b/u.test(command));
    const approved = evaluateRegisteredWriter({
      command,
      cwd,
      workspaceRoot,
      carrier: "print",
      writers: ["project-lint.mjs", "project-release.mjs"],
      toolDirectory: resolve(PLUGIN_DIRECTORY, "dist", "cli"),
    });
    if (mutates && !approved.ok) writeJson(deny("UNKNOWN_MUTATION_SHELL: print mutations require a registered wrapper"));
    return;
  }
  const findings = await findingsFor(cwd);
  if (mode === "session") {
    const { roots } = await findCarrierProjects(cwd, "print");
    if (roots.length > 0) writeJson(additionalContext("SessionStart", "[Print Project Delivery Guard] active; generated outputs require registered writers."));
  } else if (mode === "post" || mode === "failure") {
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)));
  } else if (mode === "stop" && findings.length > 0) {
    writeJson(stopBlock(format(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`[Print Project Delivery Guard] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
