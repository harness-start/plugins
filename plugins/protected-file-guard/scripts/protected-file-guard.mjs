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
} from "./lib/protected-file-policy.mjs";

const CONFIG_FILE_NAMES = [
  ".protected-file-guard.mjs",
  ".protected-file-guard.cjs",
  ".protected-file-guard.js",
];

const FILE_TOOL_NAMES = new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write",
]);

const SHELL_TOOL_NAMES = new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand",
]);

const COMMAND_SEPARATORS = new Set(["&&", "||", ";", "|", "&"]);
const SIMPLE_WRAPPERS = new Set(["busybox", "command", "exec", "nohup", "time"]);

function tokenizeShell(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const text = String(command ?? "");
  const flush = () => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      flush();
      continue;
    }
    if (char === ";") {
      flush();
      tokens.push(";");
      continue;
    }
    if (char === "|" || char === "&") {
      flush();
      if (text[index + 1] === char) {
        tokens.push(char + char);
        index += 1;
      } else {
        tokens.push(char);
      }
      continue;
    }
    current += char;
  }
  flush();
  return tokens;
}

function splitSimpleCommands(tokens) {
  const commands = [];
  let current = [];
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

function tokenBasename(token) {
  return String(token ?? "").replaceAll("\\", "/").split("/").at(-1) ?? "";
}

function unwrapCommand(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    const name = tokenBasename(token);
    if (SIMPLE_WRAPPERS.has(name)) {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-") && tokens[index] !== "--") {
        index += 1;
      }
      if (tokens[index] === "--") index += 1;
      continue;
    }
    if (name === "sudo") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) {
        const option = tokens[index];
        index += 1;
        if (["-C", "-g", "-u", "--group", "--user"].includes(option)) index += 1;
      }
      continue;
    }
    if (name === "env") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) index += 1;
      continue;
    }
    if (name === "timeout") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) {
        const option = tokens[index];
        index += 1;
        if (["-k", "-s", "--kill-after", "--signal"].includes(option)) index += 1;
      }
      if (index < tokens.length && !tokens[index].startsWith("-")) index += 1;
      continue;
    }
    if (name === "nice" || name === "stdbuf") {
      index += 1;
      while (index < tokens.length && tokens[index].startsWith("-")) index += 1;
      continue;
    }
    break;
  }
  return tokens.slice(index);
}

function nonFlagOperands(args) {
  const operands = [];
  let skipNext = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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

function targetDirectory(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-t" || arg === "--target-directory") {
      return args[index + 1] ?? "";
    }
    if (arg.startsWith("--target-directory=")) {
      return arg.slice("--target-directory=".length);
    }
  }
  return "";
}

function copyDestTargets(args) {
  const dest = targetDirectory(args);
  if (dest) return [dest];
  const operands = nonFlagOperands(args);
  return operands.length ? [operands.at(-1)] : [];
}

function moveWriteTargets(args) {
  const dest = targetDirectory(args);
  const operands = nonFlagOperands(args);
  return dest ? [dest, ...operands] : operands;
}

function looksLikeSedScript(token) {
  return /(?:^|[0-9,${}]*[!]*s)[/#@|]./u.test(token);
}

function sedWriteTargets(args) {
  const inplace = args.some(
    (arg) => arg === "--in-place" || arg.startsWith("--in-place=") || /^-[A-Za-z]*i/u.test(arg),
  );
  if (!inplace) return [];
  const files = [];
  let skipNext = false;
  let skippedScript = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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

function ddWriteTargets(args) {
  return args
    .filter((arg) => arg.startsWith("of="))
    .map((arg) => arg.slice(3));
}

function commandWriteTargets(tokens) {
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

export function extractShellWriteTargets(command) {
  const text = String(command ?? "");
  const paths = [];
  const push = (raw) => {
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

function warn(message) {
  process.stderr.write(`[protected-file-guard] ${message}\n`);
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
  return (
    event?.tool_name ??
    event?.toolName ??
    event?.tool?.name ??
    ""
  );
}

function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
}

function extractToolInput(event) {
  return (
    event?.tool_input ??
    event?.toolInput ??
    event?.tool?.input ??
    event?.input ??
    {}
  );
}

function extractCwd(event) {
  return (
    event?.cwd ??
    event?.working_directory ??
    event?.workingDirectory ??
    process.cwd()
  );
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
    const file = line.match(
      /^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u,
    );
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
  const toolName = canonicalToolName(extractToolName(event));
  const input = extractToolInput(event);
  const cwd = extractCwd(event);
  if (SHELL_TOOL_NAMES.has(toolName)) {
    const command = typeof input?.command === "string"
      ? input.command
      : typeof input?.cmd === "string" ? input.cmd : "";
    return [
      ...new Set(
        extractShellWriteTargets(command)
          .map(stripMatchingQuotes)
          .filter(Boolean)
          .map((path) =>
            isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
          ),
      ),
    ];
  }
  if (!FILE_TOOL_NAMES.has(toolName)) return [];

  const targets = objectPaths(input);
  const patchPayload = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command]
        .filter((value) => typeof value === "string")
        .join("\n");
  targets.push(...extractPatchTargets(patchPayload));

  return [
    ...new Set(
      targets
        .map(stripMatchingQuotes)
        .filter(Boolean)
        .map((path) =>
          isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))
        ),
    ),
  ];
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

function relativeOrAbsolute(filePath, base) {
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

export function resolvePhysicalTarget(filePath) {
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

export function matchPathsForTarget(filePath, repoRoot, cwd) {
  const base = repoRoot ?? cwd;
  const paths = [relativeOrAbsolute(filePath, base)];
  const physical = resolvePhysicalTarget(filePath);
  if (physical) paths.push(relativeOrAbsolute(physical, base));
  return [...new Set(paths)];
}

export async function loadUserConfig(repoRoot) {
  if (!repoRoot) return null;
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = join(repoRoot, name);
    if (!existsSync(configPath)) continue;
    try {
      const loaded = await import(pathToFileURL(configPath).href);
      return loaded.default ?? loaded;
    } catch (error) {
      warn(`failed to load ${name}: ${error.message}`);
      return null;
    }
  }
  return null;
}

function displayPath(filePath, repoRoot, cwd) {
  return relativeOrAbsolute(filePath, repoRoot ?? cwd);
}

export function formatDeny(findings) {
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

function denyOutput(reason) {
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
  const cwd = resolve(extractCwd(event));
  const targets = extractFileTargets(event);
  if (targets.length === 0) return;

  const repoRoot = resolveRepoRoot(cwd);
  const userConfig = await loadUserConfig(repoRoot);
  const rules = resolveRules(userConfig);
  const findings = [];

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
    warn(`hook failed open: ${error.message}`);
    process.exit(0);
  });
}
