#!/usr/bin/env node

import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findCarrierProjects } from "@harness/core/artifact-scan";
import { resolveWorkspaceRoot } from "@harness/core/artifact-paths";
import { evaluateRegisteredWriter } from "@harness/core/artifact-shell";
import { eventCwd, eventToolName, readStdinJson } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import {
  evaluatePptxWrite,
  findPptxProjects,
  loadPptxProject,
  validatePptxModel,
} from "../../lib/contract.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);

function deny(reason) {
  return preToolDeny(`[PPTX Project Delivery Guard] ${reason}`);
}

async function runPre(event) {
  const cwd = eventCwd(event);
  const name = eventToolName(event);
  for (const target of extractFileTargets(event, { tools: "any" })) {
    const result = evaluatePptxWrite({
      relativePath: relative(cwd, resolve(cwd, target)),
      toolName: name,
      cwd,
    });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }

  const command = extractShellCommand(event) ?? "";
  const workspaceRoot = resolveWorkspaceRoot(cwd, "pptx");
  const cwdInScope = /(?:^|[\\/])artifacts[\\/]pptx[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
  const mutatesArtifact = (/artifacts[\\/]pptx[\\/]/u.test(command) || cwdInScope)
    && /(?:^|\s)(?:cp|mv|rm|touch|tee|install|python\d*|node|npm|npx)\b|[>]{1,2}/u.test(command);
  const approved = evaluateRegisteredWriter({
    command,
    cwd,
    workspaceRoot,
    carrier: "pptx",
    writers: ["project-lint.mjs", "project-release.mjs"],
    toolDirectory: resolve(PLUGIN_DIRECTORY, "dist", "cli"),
  });
  if (mutatesArtifact && !approved.ok) {
    return deny("UNKNOWN_MUTATION_SHELL: artifact mutations must use a registered PPTX wrapper");
  }
  if (/ui-ux-pro-max|--persist|design-system[\\/]MASTER\.md/u.test(command) && /artifacts[\\/]pptx[\\/]/u.test(command)) {
    return deny("COMMUNITY_SKILL_EXECUTION_DENIED: ui-ux-pro-max is read-only advice in hard scope");
  }
  return undefined;
}

async function projectFindings(cwd, forceStage) {
  const findings = [];
  const roots = typeof findPptxProjects === "function" ? await findPptxProjects(cwd) : (await findCarrierProjects(cwd, "pptx")).roots;
  for (const root of roots) {
    try {
      const model = await loadPptxProject(root);
      const stage = forceStage ?? model.plan?.targetStage ?? "source";
      for (const item of validatePptxModel(model, { stage })) {
        findings.push({ artifactId: model.artifactId, ...item });
      }
    } catch (error) {
      findings.push({ artifactId: relative(cwd, root), code: "PROJECT_READ_FAILED", path: ".", message: error.message });
    }
  }
  return findings;
}

function formatFindings(findings) {
  return [
    "[PPTX Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Fix the named source/manifest/output, then run the registered validator or writer again.",
  ].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = eventCwd(event);

  if (mode === "pre") {
    writeJson(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findPptxProjects(cwd);
    if (roots.length > 0) writeJson(additionalContext("SessionStart", `[PPTX Project Delivery Guard] discovered ${roots.length} project(s); generated outputs require registered writers.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "stop") {
    const findings = await projectFindings(cwd);
    if (findings.length > 0) writeJson(stopBlock(formatFindings(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[PPTX Project Delivery Guard] ${error.message}\n`);
    process.exitCode = 2;
  });
}
