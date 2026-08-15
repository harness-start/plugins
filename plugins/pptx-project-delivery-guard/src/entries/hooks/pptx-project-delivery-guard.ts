#!/usr/bin/env node

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluatePptxWrite,
  findPptxProjects,
  loadPptxProject,
  validatePptxModel,
} from "../../lib/contract.js";

function readEvent() {
  return new Promise((resolvePromise) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        resolvePromise(raw.trim() ? JSON.parse(raw) : {});
      } catch {
        resolvePromise({ __parseError: true });
      }
    });
  });
}

function toolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

function toolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

function cwdOf(event) {
  return resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());
}

function patchTargets(value) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)].map((match) => match[1].trim());
}

function targetsOf(event) {
  const input = toolInput(event);
  const values = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile"]) {
    if (typeof input?.[key] === "string") values.push(input[key]);
  }
  for (const value of [input?.patch, input?.input]) values.push(...patchTargets(value));
  return [...new Set(values)];
}

function commandOf(event) {
  const input = toolInput(event);
  return typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
}

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `[PPTX Project Delivery Guard] ${reason}`,
    },
  };
}

function context(eventName, message) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: message,
    },
  };
}

function emit(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function runPre(event) {
  const cwd = cwdOf(event);
  const name = toolName(event);
  for (const target of targetsOf(event)) {
    const absolute = resolve(cwd, target);
    const result = evaluatePptxWrite({ relativePath: relative(cwd, absolute), toolName: name });
    if (result.decision === "deny") return deny(`${result.code}: ${result.message}`);
  }

  const command = commandOf(event);
  const cwdInScope = /(?:^|[\\/])artifacts[\\/]pptx[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
  const mutatesArtifact = (/artifacts[\\/]pptx[\\/]/u.test(command) || cwdInScope) && /(?:^|\s)(?:cp|mv|rm|touch|tee|install|python\d*|node|npm|npx)\b|[>]{1,2}/u.test(command);
  const compoundShell = /(?:&&|\|\||[;&|><`\n]|\$\()/u.test(command);
  const approvedWrapper = /pptx-project-delivery-guard[\\/]scripts[\\/]tools[\\/](?:project-lint|project-release)\.mjs\b/u.test(command) && !compoundShell;
  if (mutatesArtifact && !approvedWrapper) {
    return deny("UNKNOWN_MUTATION_SHELL: artifact mutations must use a registered PPTX wrapper");
  }
  if (/ui-ux-pro-max|--persist|design-system[\\/]MASTER\.md/u.test(command) && /artifacts[\\/]pptx[\\/]/u.test(command)) {
    return deny("COMMUNITY_SKILL_EXECUTION_DENIED: ui-ux-pro-max is read-only advice in hard scope");
  }
  return undefined;
}

async function projectFindings(cwd, forceStage) {
  const findings = [];
  for (const root of await findPptxProjects(cwd)) {
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
  const event = await readEvent();
  if (event.__parseError) return;
  const cwd = cwdOf(event);

  if (mode === "pre") {
    emit(await runPre(event));
    return;
  }
  if (mode === "session") {
    const roots = await findPptxProjects(cwd);
    if (roots.length > 0) emit(context("SessionStart", `[PPTX Project Delivery Guard] discovered ${roots.length} project(s); generated outputs require registered writers.`));
    return;
  }
  if (mode === "post" || mode === "failure") {
    const findings = await projectFindings(cwd);
    if (findings.length > 0) emit(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", formatFindings(findings)));
    return;
  }
  if (mode === "stop") {
    const findings = await projectFindings(cwd);
    if (findings.length > 0) {
      process.stderr.write(`${formatFindings(findings)}\n`);
      process.exitCode = 2;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[PPTX Project Delivery Guard] ${error.message}\n`);
    process.exitCode = 2;
  });
}
