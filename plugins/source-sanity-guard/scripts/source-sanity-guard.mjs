#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  analyzeGarbledText,
  isBackupArtifactPath,
  isBuiltInSkippedPath,
  isTextPath,
  modeFor,
  resolveConfig,
} from "./lib/source-sanity-policy.mjs";

const CONFIG_FILE_NAME = ".source-sanity-guard.mjs";
const FILE_TOOLS = new Set([
  "applypatch",
  "edit",
  "multiedit",
  "notebookedit",
  "write",
]);

function warn(message) {
  process.stderr.write(`[source-sanity-guard] ${message}\n`);
}

async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}

function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
}

function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

export function extractPatchTargets(payload) {
  if (typeof payload !== "string") return [];
  const targets = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file) targets.push(stripMatchingQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) targets.push(stripMatchingQuotes(move[1]));
  }
  return targets;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "target_file",
    "output_file",
    "outputFile",
    "notebook_path",
    "notebookPath",
  ]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}

export function extractFileTargets(event) {
  if (!FILE_TOOLS.has(canonicalToolName(extractToolName(event)))) return [];
  const input = extractToolInput(event);
  const cwd = extractCwd(event);
  const targets = objectPaths(input);
  const patch = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command]
        .filter((value) => typeof value === "string")
        .join("\n");
  targets.push(...extractPatchTargets(patch));
  return [...new Set(targets.map(stripMatchingQuotes).filter(Boolean).map((path) =>
    isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
  ))];
}

export function extractInsertedText(event) {
  const input = extractToolInput(event);
  const texts = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const key of ["content", "new_string", "newString", "text", "cell_source", "patch", "input"]) {
      if (typeof value[key] === "string") texts.push(value[key]);
    }
    if (Array.isArray(value.edits)) value.edits.forEach(visit);
  };
  if (typeof input === "string") texts.push(input);
  else visit(input);
  return texts.join("\n");
}

export function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function relativePath(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}

async function loadUserConfig(repoRoot) {
  if (!repoRoot) return null;
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${error.message}`);
    return null;
  }
}

function preToolDeny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

function reportOutput(eventName, text) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  };
}

function writeOutput(value) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}

function formatPreFindings(findings) {
  return [
    "[Source Sanity Guard] 检测到不安全的源码写入",
    "",
    ...findings.map((finding) => `- ${finding.path}: ${finding.message}`),
    "",
    "blockingContract:",
    "  observedFacts: 文件目标或待写入内容命中了源码卫生检查。",
    "  harm: 备份产物和明显乱码会污染源码、评审与后续构建。",
    "  unblockWhen: 改用正式源码路径，并移除明显损坏的替换字符。",
    "  recovery: 从权威源恢复原始文本；不要提交临时副本或用猜测内容替换乱码。",
  ].join("\n");
}

async function runPre(event, config, repoRoot, cwd) {
  const targets = extractFileTargets(event);
  if (targets.length === 0) return;
  const insertedText = extractInsertedText(event);
  const garbled = analyzeGarbledText(insertedText);
  const findings = [];
  let hasBlock = false;

  for (const target of targets) {
    const path = relativePath(target, repoRoot, cwd);
    if (isBuiltInSkippedPath(path)) continue;
    const backupMode = modeFor("backupArtifact", path, config);
    if (backupMode !== "off" && isBackupArtifactPath(path)) {
      findings.push({ path, mode: backupMode, message: "源码目录中的备份或临时文件名" });
      if (backupMode === "block") hasBlock = true;
    }
    const garbledMode = modeFor("garbledText", path, config);
    if (garbled && garbledMode !== "off" && isTextPath(path)) {
      findings.push({
        path,
        mode: garbledMode,
        message: `待写入文本包含 ${garbled.replacementCharacters} 个 U+FFFD 替换字符`,
      });
      if (garbledMode === "block") hasBlock = true;
    }
  }
  if (findings.length === 0) return;
  const message = formatPreFindings(findings);
  writeOutput(hasBlock ? preToolDeny(message) : reportOutput("PreToolUse", message));
}

export async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve(extractCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  const config = resolveConfig(await loadUserConfig(repoRoot));
  await runPre(event, config, repoRoot, cwd);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error.message}`);
    process.exit(0);
  });
}
