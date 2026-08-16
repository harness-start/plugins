#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  matchRule,
  resolveRules,
  type ProtectionRule,
} from "../../lib/protected-file-policy.js";
import {
  eventCwd,
  eventToolName,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { extractFileTargets as extractCoreFileTargets, extractShellCommand, isFileMutationTool, isShellTool } from "@harness/core/hook-targets";
import { tokenizeShell } from "@harness/core/shell-parse";

const CONFIG_FILE_NAMES = [
  ".dependency-file-custody.mjs",
  ".dependency-file-custody.cjs",
  ".dependency-file-custody.js",
];

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

function ddWriteTargets(args: string[]): string[] {
  return args
    .filter((arg) => arg.startsWith("of="))
    .map((arg) => arg.slice(3));
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
  if (name === "install") return copyDestTargets(args);
  if (name === "dd") return ddWriteTargets(args);
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
  process.stderr.write(`[dependency-file-custody] ${message}\n`);
}

export { extractPatchPaths as extractPatchTargets } from "@harness/core/hook-targets";

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

function relativeOrAbsolute(filePath: string, base: string): string {
  const candidate = relative(base, filePath);
  if (
    candidate &&
    candidate !== ".." &&
    !candidate.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(candidate)
  ) {
    return candidate.replaceAll("\\", "/");
  }
  return filePath.replaceAll("\\", "/");
}

export function resolvePhysicalTarget(filePath: string): string | null {
  let cursor = filePath;
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return resolve(realpathSync(cursor), ...suffix);
  } catch {
    return null;
  }
}

export function matchPathsForTarget(filePath: string, repoRoot: string | null, cwd: string): string[] {
  const base = repoRoot ?? cwd;
  const paths = [relativeOrAbsolute(filePath, base)];
  const physical = resolvePhysicalTarget(filePath);
  if (physical) paths.push(relativeOrAbsolute(physical, base));
  return [...new Set(paths)];
}

export async function loadUserConfig(repoRoot: string | null): Promise<unknown> {
  if (!repoRoot) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = join(repoRoot, name);
    if (!existsSync(configPath)) continue;
    try {
      const loaded = await import(pathToFileURL(configPath).href);
      return loaded.default ?? loaded;
    } catch (error) {
      warn(`failed to load ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  return null;
}

function displayPath(filePath: string, repoRoot: string | null, cwd: string): string {
  return relativeOrAbsolute(filePath, repoRoot ?? cwd);
}

export function formatDeny(findings: Array<{ path: string; rule: ProtectionRule }>) {
  const shown = findings.slice(0, 10);
  const details = shown.flatMap((finding) => [
    `- ${finding.path}`,
    `  rule: ${finding.rule.id}`,
    `  reason: ${finding.rule.reason ?? "the target path is covered by a project protection rule"}`,
  ]);
  if (findings.length > shown.length) {
    details.push(`- ${findings.length - shown.length} additional protected target(s)`);
  }
  const recoveries = [
    ...new Set(
      shown.map((finding) =>
        finding.rule.recovery ??
        "Change the authoritative source instead; if an exception is required, add a narrower allow rule to the project configuration."
      ),
    ),
  ];
  return [
    "[Protected File Guard] Protected file modification blocked",
    "",
    ...details,
    "",
    "blockingContract:",
    "  observedFacts: One or more file-tool targets matched a protected-path rule.",
    "  harm: Directly editing lockfiles or third-party dependency directories separates generated state from authoritative declarations, and reinstalling may discard the changes.",
    "  unblockWhen: The operation no longer writes to a protected path, or a more specific project allow rule explicitly permits it.",
    "  recovery:",
    ...recoveries.map((recovery) => `    - ${recovery}`),
  ].join("\n");
}

function denyOutput(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve(eventCwd(event));
  const targets = extractFileTargets(event);
  if (targets.length === 0) return;

  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const rules = resolveRules(userConfig);
  const findings: Array<{ path: string; rule: ProtectionRule }> = [];

  for (const target of targets) {
    const rule = matchRule(matchPathsForTarget(target, repoRoot, cwd), rules);
    if (!rule || rule.mode === "allow") continue;
    findings.push({ path: displayPath(target, repoRoot, cwd), rule });
  }
  if (findings.length === 0) return;
  process.stdout.write(`${JSON.stringify(denyOutput(formatDeny(findings)))}\n`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
