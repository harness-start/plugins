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
  type SanityConfig,
} from "../../lib/source-sanity-policy.js";
import {
  eventCwd,
  eventToolName,
  isRecord,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { extractFileTargets as extractCoreFileTargets, extractPatchPaths, extractShellCommand, isFileMutationTool, isShellTool } from "@harness/core/hook-targets";
import { tokenizeShell } from "@harness/core/shell-parse";

const CONFIG_FILE_NAME = ".source-sanity-guard.mjs";
const COMMAND_SEPARATORS = new Set(["&&", "||", ";", "|", "&"]);
const SIMPLE_WRAPPERS = new Set(["busybox", "command", "exec", "nohup", "time"]);

function splitSimpleCommands(tokens: string[]): string[][] {
  const commands: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS.has(token)) {
      if (current.length) commands.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) commands.push(current);
  return commands;
}

function tokenBasename(token: unknown): string {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}

function unwrapCommand(tokens: string[]): string[] {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_WRAPPERS.has(name)) {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === undefined || !option.startsWith("-") || option === "--") break;
        index += 1;
      }
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === undefined || !option.startsWith("-")) break;
        index += 1;
        if (["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "env") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === undefined || !option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === undefined || !option.startsWith("-")) break;
        index += 1;
        if (["-k", "-s", "--kill-after", "--signal"].includes(option)) index += 1;
      }
      const duration = tokens[index];
      if (duration !== undefined && !duration.startsWith("-")) index += 1;
      continue;
    }
    if (name === "nice" || name === "stdbuf") {
      index += 1;
      while (index < tokens.length) {
        const option = tokens[index];
        if (option === undefined || !option.startsWith("-")) break;
        index += 1;
      }
      continue;
    }
    break;
  }
  return tokens.slice(index);
}

function nonFlagOperands(args: string[]): string[] {
  const operands: string[] = [];
  let skipNext = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      operands.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("-")) {
      if (arg === "-t" || arg === "--target-directory") skipNext = true;
      continue;
    }
    operands.push(arg);
  }
  return operands;
}

function targetDirectory(args: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "-t" || arg === "--target-directory") {
      return args[index + 1] ?? "";
    }
    if (arg.startsWith("--target-directory=")) {
      return arg.slice("--target-directory=".length);
    }
  }
  return "";
}

function copyDestTargets(args: string[]): string[] {
  const dest = targetDirectory(args);
  if (dest) return [dest];
  const operands = nonFlagOperands(args);
  const last = operands.at(-1);
  return last === undefined ? [] : [last];
}

function moveWriteTargets(args: string[]): string[] {
  const dest = targetDirectory(args);
  const operands = nonFlagOperands(args);
  return dest ? [dest, ...operands] : operands;
}

function looksLikeSedScript(token: string): boolean {
  return /(?:^|[0-9,${}]*[!]*s)[/#@|]./u.test(token);
}

function sedWriteTargets(args: string[]): string[] {
  const inplace = args.some(
    (arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg),
  );
  if (!inplace) return [];
  const files: string[] = [];
  let skipNext = false;
  let skippedScript = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      files.push(...args.slice(index + 1));
      break;
    }
    if (arg === "-e" || arg === "-f" || arg === "--expression" || arg === "--file") {
      skipNext = true;
      skippedScript = true;
      continue;
    }
    if (arg.startsWith("-") || arg === "") continue;
    if (!skippedScript && looksLikeSedScript(arg)) {
      skippedScript = true;
      continue;
    }
    files.push(arg);
  }
  return files;
}

function commandWriteTargets(tokens: string[]): string[] {
  const invocation = unwrapCommand(tokens);
  if (!invocation.length) return [];
  const name = tokenBasename(invocation[0]);
  const args = invocation.slice(1);
  if (name === "sed") return sedWriteTargets(args);
  if (name === "cp") return copyDestTargets(args);
  if (name === "mv") return moveWriteTargets(args);
  if (name === "rm") return nonFlagOperands(args);
  return [];
}

export function extractShellWriteTargets(command: unknown): string[] {
  const text = String(command ?? "");
  const paths: string[] = [];
  const push = (raw: unknown) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) {
    push(match[1]);
  }
  for (const tokens of splitSimpleCommands(tokenizeShell(text))) {
    for (const path of commandWriteTargets(tokens)) push(path);
  }
  return [...new Set(paths)];
}

function warn(message: string) {
  process.stderr.write(`[source-sanity-guard] ${message}\n`);
}

export const extractPatchTargets = extractPatchPaths;

export function extractFileTargets(event: HookEvent): string[] {
  if (isShellTool(eventToolName(event))) {
    const cwd = eventCwd(event);
    return [...new Set(
      extractShellWriteTargets(extractShellCommand(event) ?? "")
        .filter(Boolean)
        .map((path) => (isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))),
    )];
  }
  if (!isFileMutationTool(eventToolName(event))) return [];
  return extractCoreFileTargets(event);
}

export function extractInsertedText(event: HookEvent): string {
  const tool = isRecord(event.tool) ? event.tool : undefined;
  const input = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input ?? {};
  const texts: string[] = [];
  if (isShellTool(eventToolName(event))) {
    const command = extractShellCommand(event);
    if (command) texts.push(command);
  }
  const visit = (value: unknown): void => {
    if (!isRecord(value)) return;
    for (const key of ["content", "new_string", "newString", "text", "cell_source", "patch", "input"]) {
      const field = value[key];
      if (typeof field === "string") texts.push(field);
    }
    if (Array.isArray(value.edits)) value.edits.forEach(visit);
  };
  if (typeof input === "string") texts.push(input);
  else visit(input);
  return texts.join("\n");
}

export function resolveRepoRoot(cwd: string): string | null {
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

function relativePath(filePath: string, repoRoot: string | null, cwd: string): string {
  const base = repoRoot ?? cwd;
  const candidate = relative(base, filePath).replaceAll("\\", "/");
  return candidate.startsWith("../") ? filePath.replaceAll("\\", "/") : candidate;
}

async function loadUserConfig(repoRoot: string | null): Promise<unknown> {
  if (!repoRoot) return null;
  const configPath = join(repoRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) return null;
  try {
    const loaded = await import(pathToFileURL(configPath).href);
    return loaded.default ?? loaded;
  } catch (error) {
    warn(`failed to load ${CONFIG_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function preToolDeny(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

function reportOutput(eventName: string, text: string) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  };
}

function writeOutput(value: unknown) {
  if (value) process.stdout.write(`${JSON.stringify(value)}\n`);
}

function formatPreFindings(findings: Array<{ path: string; message: string }>) {
  return [
    "[Source Sanity Guard] Unsafe source write detected",
    "",
    ...findings.map((finding) => `- ${finding.path}: ${finding.message}`),
    "",
    "blockingContract:",
    "  observedFacts: A file target or pending content matched a source hygiene check.",
    "  harm: Backup artifacts and clearly garbled text contaminate source, reviews, and later builds.",
    "  unblockWhen: Use the canonical source path and remove clearly corrupted replacement characters.",
    "  recovery: Restore the original text from an authoritative source; do not commit temporary copies or replace corruption with guessed content.",
  ].join("\n");
}

async function runPre(event: HookEvent, config: SanityConfig, repoRoot: string | null, cwd: string) {
  const targets = extractFileTargets(event);
  if (targets.length === 0) return;
  const insertedText = extractInsertedText(event);
  const garbled = analyzeGarbledText(insertedText);
  const findings: Array<{ path: string; mode: string; message: string }> = [];
  let hasBlock = false;

  for (const target of targets) {
    const path = relativePath(target, repoRoot, cwd);
    if (isBuiltInSkippedPath(path)) continue;
    const backupMode = modeFor("backupArtifact", path, config);
    if (backupMode !== "off" && isBackupArtifactPath(path)) {
      findings.push({ path, mode: backupMode, message: "backup or temporary filename inside a source directory" });
      if (backupMode === "block") hasBlock = true;
    }
    const garbledMode = modeFor("garbledText", path, config);
    if (garbled && garbledMode !== "off" && isTextPath(path)) {
      findings.push({
        path,
        mode: garbledMode,
        message: `pending text contains ${garbled.replacementCharacters} U+FFFD replacement character(s)`,
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
  const cwd = resolve(eventCwd(event));
  const repoRoot = resolveRepoRoot(cwd);
  const config = resolveConfig(await loadUserConfig(repoRoot));
  await runPre(event, config, repoRoot, cwd);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
