#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateMusicWrite, validateMusicModel } from "./lib/contract.mjs";

async function readEvent() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return { __parseError: true };
  }
}

const inputOf = (event) => event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
const nameOf = (event) => event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
const cwdOf = (event) => resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd());

function targetsOf(event) {
  const input = inputOf(event);
  const targets = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "outputFile"]) {
    if (typeof input?.[key] === "string") targets.push(input[key]);
  }
  for (const value of [input?.patch, input?.input]) {
    if (typeof value !== "string") continue;
    for (const match of value.matchAll(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/gmu)) targets.push(match[1].trim());
  }
  return [...new Set(targets)];
}

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `[Tone.js Music Production] ${reason}`,
    },
  };
}

function context(eventName, message) {
  return { hookSpecificOutput: { hookEventName: eventName, additionalContext: message } };
}

async function discover(cwd) {
  const root = join(cwd, "artifacts", "music");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name))
      .slice(0, 32)
      .map((entry) => join(root, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function collect(root, directory, files, digests, count) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(root, absolute, files, digests, count);
    } else if (entry.isFile()) {
      count.value += 1;
      if (count.value > 4096) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      if (bytes.byteLength > 512 * 1024 * 1024) throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${entry.name}`);
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      files[filePath] = bytes.toString("utf8");
      digests[filePath] = createHash("sha256").update(bytes).digest("hex");
    }
  }
}

async function findingsFor(cwd) {
  const findings = [];
  for (const root of await discover(cwd)) {
    const files = {};
    const digests = {};
    await collect(root, root, files, digests, { value: 0 });
    if (!("plan.contract.json" in files)) continue;
    const parse = (filePath) => {
      try { return JSON.parse(files[filePath] ?? ""); } catch { return null; }
    };
    const plan = parse("plan.contract.json");
    const project = parse("music.project.json");
    const model = { artifactId: basename(root), files, digests, plan, project };
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
  const event = await readEvent();
  if (event.__parseError) return;
  if (mode === "stop" && (event?.stop_hook_active === true || event?.stopHookActive === true)) return;
  const cwd = cwdOf(event);
  if (mode === "pre") {
    for (const target of targetsOf(event)) {
      const result = evaluateMusicWrite({ relativePath: relative(cwd, resolve(cwd, target)), toolName: nameOf(event) });
      if (result.decision === "deny") {
        process.stdout.write(`${JSON.stringify(deny(`${result.code}: ${result.message}`))}\n`);
        return;
      }
    }
    const input = inputOf(event);
    const command = typeof input?.command === "string" ? input.command : typeof input?.cmd === "string" ? input.cmd : "";
    const cwdInScope = /(?:^|[\\/])artifacts[\\/]music[\\/][^\\/]+(?:[\\/]|$)/u.test(cwd);
    const commandInScope = /artifacts[\\/]music[\\/]/u.test(command) || cwdInScope;
    const compoundShell = /(?:&&|\|\||[;&|><`\n]|\$\()/u.test(command);
    const approvedWrapper = /^\s*(?:[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s;&|><`$()]+)\s+)*node\s+(?:"[^"]*tonejs-music-production[\\/]scripts[\\/]tools[\\/]project-(?:init|lint|optimize|preview|render|release)\.mjs"|'[^']*tonejs-music-production[\\/]scripts[\\/]tools[\\/]project-(?:init|lint|optimize|preview|render|release)\.mjs'|[^\s;&|><`$()]*tonejs-music-production[\\/]scripts[\\/]tools[\\/]project-(?:init|lint|optimize|preview|render|release)\.mjs)(?:\s+(?:"[^"]*"|'[^']*'|[^\s;&|><`$()]+))*\s*$/u.test(command)
      && !compoundShell;
    const safeReadOnly = /^\s*(?:pwd|ls(?:\s+[-\w./]+)*|(?:cat|head|tail|stat|file|sha256sum)(?:\s+[-\w./]+)+|git\s+(?:status|diff)(?:\s+[-\w./]+)*)\s*$/u.test(command)
      && !compoundShell;
    if (commandInScope && command && !approvedWrapper && !safeReadOnly) process.stdout.write(`${JSON.stringify(deny("UNKNOWN_MUTATION_SHELL: music scope allows only registered wrappers or a narrow read-only command"))}\n`);
    return;
  }
  const findings = await findingsFor(cwd);
  if (mode === "session") {
    if ((await discover(cwd)).length > 0) process.stdout.write(`${JSON.stringify(context("SessionStart", "[Tone.js Music Production] active; generated scores, audio, and receipts require registered writers."))}\n`);
  } else if (mode === "post" || mode === "failure") {
    if (findings.length > 0) process.stdout.write(`${JSON.stringify(context(mode === "post" ? "PostToolUse" : "PostToolUseFailure", format(findings)))}\n`);
  } else if (mode === "stop" && findings.length > 0) {
    process.stderr.write(`${format(findings)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[Tone.js Music Production] ${error.message}\n`);
    process.exitCode = 2;
  });
}
