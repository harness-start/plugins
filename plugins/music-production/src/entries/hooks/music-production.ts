#!/usr/bin/env node

import { createHash } from "node:crypto";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectProjectFiles, findCarrierProjects } from "@harness/core/artifact-scan";
import { resolveWorkspaceRoot } from "@harness/core/artifact-paths";
import { eventCwd, eventSessionId, eventToolName, isStopHookActive, readStdinJson } from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { eventTouchesArtifact, extractFileTargets, extractShellCommand } from "@harness/core/hook-targets";

import { issueMusicWriterCapability } from "../../lib/capability.js";
import { computeMusicSubjectDigest, evaluateMusicWrite, validateMusicModel, validateMusicReferenceProfile, type MusicFinding, type MusicProjectConfig } from "../../lib/contract.js";
import { evaluateMusicShell } from "../../lib/shell-policy.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);

function deny(reason: string) {
  return preToolDeny(`[Music Project Delivery Guard] ${reason}`);
}

type HookFinding = MusicFinding & { artifactId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findingsFor(cwd: string) {
  const findings: HookFinding[] = [];
  const { roots } = await findCarrierProjects(cwd, "music");
  for (const root of roots) {
    const collected = await collectProjectFiles(root, { maxFiles: 4096, maxFileBytes: 512 * 1024 * 1024 });
    if (!("plan.contract.json" in collected.files)) continue;
    const parse = (filePath: string): unknown => {
      try { return JSON.parse(collected.files[filePath] ?? "") as unknown; } catch { return null; }
    };
    const plan = parse("plan.contract.json");
    const project = parse("music.project.json");
    const model = {
      artifactId: basename(root),
      files: collected.files,
      digests: collected.digests,
      plan,
      project: isRecord(project) ? project as MusicProjectConfig : null,
    };
    const stage = isRecord(plan) && typeof plan.targetStage === "string" ? plan.targetStage : "source";
    for (const item of validateMusicModel(model, { stage })) {
      findings.push({ artifactId: model.artifactId, ...item });
    }
  }
  return findings;
}

function format(findings: HookFinding[]) {
  return [
    "[Music Project Delivery Guard] Project contract violations",
    ...findings.slice(0, 50).map((item) => `- ${item.artifactId}/${item.path} [${item.code}] ${item.message}`),
    "recovery: Use $music-project-authoring to refresh advice, optimize, render, and preview; use a separate $music-project-review session before stage and release.",
  ].join("\n");
}

function isReferenceDownstreamPath(projectRoot: string, target: string) {
  const path = relative(projectRoot, target).replaceAll("\\", "/");
  return path === "plan.direction.json" || path === "plan.arrangement.json" || path === "src/composition.mjs" || path.startsWith("src/instruments/");
}

async function main() {
  const mode = process.argv[2] ?? "session";
  const event = await readStdinJson();
  if (event.__parseError) return;
  if (mode === "stop" && isStopHookActive(event)) return;
  const cwd = eventCwd(event);
  if (mode === "pre") {
    for (const target of extractFileTargets(event, { tools: "any" })) {
      const absoluteTarget = resolve(cwd, target);
      const result = evaluateMusicWrite({
        relativePath: relative(cwd, absoluteTarget),
        toolName: eventToolName(event),
        cwd,
      });
      if (result.decision === "deny") {
        writeJson(deny(`${result.code}: ${result.message}`));
        return;
      }
      const normalized = absoluteTarget.replaceAll("\\", "/");
      const projectMatch = /^(?<root>.*\/artifacts\/music\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/u.exec(normalized);
      if (projectMatch?.groups?.root) {
        try {
          const collected = await collectProjectFiles(projectMatch.groups.root, { maxFiles: 4096, maxFileBytes: 512 * 1024 * 1024 });
          const plan = JSON.parse(collected.files["plan.contract.json"] ?? "null") as Record<string, unknown> | null;
          if (plan?.targetStage === "release") {
            writeJson(deny("RELEASE_STAGE_LOCKED: source and plan files cannot be edited after the monotonic release transition"));
            return;
          }
          if (isReferenceDownstreamPath(projectMatch.groups.root, absoluteTarget)) {
            const model = { artifactId: basename(projectMatch.groups.root), files: collected.files, digests: collected.digests };
            if (validateMusicReferenceProfile(model).length > 0) {
              writeJson(deny("REFERENCE_PROFILE_REQUIRED: source-analysis briefs require a current controlled reference profile before direction or source edits"));
              return;
            }
          }
        } catch { /* malformed projects are reported by post/stop validation */ }
      }
    }
    const command = extractShellCommand(event) ?? "";
    const shell = evaluateMusicShell({ command, cwd, workspaceRoot: resolveWorkspaceRoot(cwd, "music"), toolDirectory: resolve(PLUGIN_DIRECTORY, "dist", "cli") });
    if (shell.decision === "deny") {
      writeJson(deny(`${shell.code}: ${shell.message}`));
      return;
    }
    if (shell.decision === "registered" && shell.capability) {
      const sessionId = eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
      if (shell.writer === "project-init.mjs") {
        try {
          const subjectDigest = createHash("sha256").update(`music-production@0.4.0\ninit\0${shell.projectRoot}`).digest("hex");
          await issueMusicWriterCapability({ root: shell.projectRoot, capability: shell.capability, argv: shell.argv, subjectDigest, sessionId, ...(process.env.AI_EXPERTS_TRIGGER_FROM ? { triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM } : {}) });
        } catch (error) {
          writeJson(deny(error instanceof Error ? error.message : String(error)));
        }
        return;
      }
      const collected = await collectProjectFiles(shell.projectRoot, { maxFiles: 4096, maxFileBytes: 512 * 1024 * 1024 });
      const parsed = (path: string): unknown => { try { return JSON.parse(collected.files[path] ?? "null") as unknown; } catch { return null; } };
      const model = { artifactId: basename(shell.projectRoot), files: collected.files, digests: collected.digests, plan: parsed("plan.contract.json"), project: parsed("music.project.json") as MusicProjectConfig | null };
      try {
        if (isRecord(model.plan) && model.plan.targetStage === "release" && shell.writer !== "project-release.mjs") throw new Error("RELEASE_STAGE_LOCKED");
        if (["project-optimize.mjs", "project-render.mjs", "project-preview.mjs", "project-review.mjs", "project-stage.mjs", "project-release.mjs"].includes(shell.writer)
          && validateMusicReferenceProfile(model).length > 0) throw new Error("REFERENCE_PROFILE_REQUIRED");
        await issueMusicWriterCapability({ root: shell.projectRoot, capability: shell.capability, argv: shell.argv, subjectDigest: computeMusicSubjectDigest(model), sessionId, ...(process.env.AI_EXPERTS_TRIGGER_FROM ? { triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM } : {}) });
      } catch (error) {
        writeJson(deny(error instanceof Error ? error.message : String(error)));
      }
    }
    return;
  }
  if (mode === "session") {
    const { roots } = await findCarrierProjects(cwd, "music");
    if (roots.length > 0) writeJson(additionalContext("SessionStart", "[Music Project Delivery Guard] active. Use $music-project-authoring for production and hand the current digest to a separate $music-project-review session."));
    return;
  }
  if ((mode === "post" || mode === "failure") && !eventTouchesArtifact(event, "music")) return;
  const findings = await findingsFor(cwd);
  if (mode === "post" || mode === "failure") {
    if (findings.length > 0) writeJson(additionalContext(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)));
  } else if (mode === "stop" && findings.length > 0) {
    writeJson(stopBlock(format(findings)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
    process.stderr.write(`[Music Project Delivery Guard] ${message}\n`);
    process.exitCode = 2;
  });
}
