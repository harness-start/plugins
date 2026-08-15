#!/usr/bin/env node

import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectProjectFiles, findCarrierProjects } from "@harness/core/artifact-scan";
import { resolveWorkspaceRoot } from "@harness/core/artifact-paths";
import { evaluateRegisteredWriter } from "@harness/core/artifact-shell";
import { eventCwd, eventToolName, isStopHookActive, readStdinJson } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import { evaluateMusicWrite, validateMusicModel } from "../../lib/contract.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);

function deny(reason) {
  return preToolDeny(`[Tone.js Music Production] ${reason}`);
}

async function findingsFor(cwd) {
  const findings = [];
  const { roots } = await findCarrierProjects(cwd, "music");
  for (const root of roots) {
    const collected = await collectProjectFiles(root, { maxFiles: 4096, maxFileBytes: 512 * 1024 * 1024 });
    if (!("plan.contract.json" in collected.files)) continue;
    const parse = (filePath) => {
      try { return JSON.parse(collected.files[filePath] ?? ""); } catch { return null; }
    };
    const plan = parse("plan.contract.json");
    const project = parse("music.project.json");
    const model = { artifactId: basename(root), files: collected.files, digests: collected.digests, plan, project };
    for (const item of validateMusicModel(model, { stage: plan?.targetStage ?? "source" })) {
      findings.push({ artifactId: model.artifactId, ...item });
    }
  }
  return findings;
}

function format(findings) {
  return [
    "[Tone.js Music Production] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Edit composition sources, then rerun project-optimize, project-render, and project-release as required.",
  ].join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (mode === "stop" && isStopHookActive(event)) return;
  const cwd = eventCwd(event);
  if (mode === "pre") {
    for (const target of extractFileTargets(event, { tools: "any" })) {
      const result = evaluateMusicWrite({
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
    const workspaceRoot = resolveWorkspaceRoot(cwd, "music");
    const cwdInScope = /(?:^|[\\/])artifacts[\\/]music[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
    const commandInScope = /artifacts[\\/]music[\\/]/u.test(command) || cwdInScope;
    const approved = evaluateRegisteredWriter({
      command,
      cwd,
      workspaceRoot,
      carrier: "music",
      writers: ["project-init.mjs", "project-lint.mjs", "project-optimize.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs"],
      toolDirectory: resolve(PLUGIN_DIRECTORY, "dist", "cli"),
    });
    const words = command.trim() ? command : "";
    const safeReadOnly = /^\s*(?:pwd|ls(?:\s+[-\w./]+)*|(?:cat|head|tail|stat|file|sha256sum)(?:\s+[-\w./]+)+|git\s+(?:status|diff)(?:\s+[-\w./]+)*)\s*$/u.test(words);
    if (commandInScope && command && !approved.ok && !safeReadOnly) {
      writeJson(deny("UNKNOWN_MUTATION_SHELL: music scope allows only registered wrappers or a narrow read-only command"));
    }
    return;
  }
  const findings = await findingsFor(cwd);
  if (mode === "session") {
    const { roots } = await findCarrierProjects(cwd, "music");
    if (roots.length > 0) writeJson(additionalContext("SessionStart", "[Tone.js Music Production] active; generated scores, audio, and receipts require registered writers."));
  } else if (mode === "post" || mode === "failure") {
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)));
  } else if (mode === "stop" && findings.length > 0) {
    writeJson(stopBlock(format(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[Tone.js Music Production] ${error.message}\n`);
    process.exitCode = 2;
  });
}
