#!/usr/bin/env node

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord, eventCwd, eventToolName, readStdinJson, type HookEvent } from "@harness/core/hook-event";
import { extractFileTargets as extractCoreFileTargets, extractShellCommand, isFileMutationTool, isShellTool } from "@harness/core/hook-targets";

import {
  capOutput,
  findExecutable,
  hasEslintConfig,
  isSkippedPath,
  isSourceFileWithinLimit,
  loadUserConfig,
  markMissingOnce,
  modeFor,
  readState,
  recordPhpFiles,
  repoRelativePath,
  resolveConfig,
  resolveRepoRoot,
  runCommand,
  type CheckMode,
  type CommandResult,
  type QualityState,
} from "../../lib/code-quality-core.js";

type Finding = {
  check: string;
  path: string;
  mode: string;
  message: string;
};

function extractShellWriteTargets(command: string): string[] {
  const text = String(command ?? "");
  const paths: string[] = [];
  const push = (raw: string | undefined) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  return [...new Set(paths)];
}
const ESLINT_PATH = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu;

function warn(message: string): void {
  process.stderr.write(`[engineering-quality] ${message}\n`);
}

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

function combinedOutput(result: CommandResult): string {
  return [result.stdout, result.stderr].filter((value) => value?.trim()).join("\n").trim();
}

function finding(check: string, path: string, mode: string, message: string): Finding {
  return { check, path, mode, message };
}

function eslintMessages(result: CommandResult, path: string, mode: string): Finding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout || "[]");
  } catch {
    return [finding("ESLint", path, "report", combinedOutput(result) || "ESLint returned no parseable JSON")];
  }
  const findings: Finding[] = [];
  if (!Array.isArray(parsed)) return findings;
  for (const file of parsed) {
    if (!isRecord(file)) continue;
    const messages = Array.isArray(file.messages) ? file.messages : [];
    for (const message of messages) {
      if (!isRecord(message)) continue;
      const position = message.line ? `:${message.line}${message.column ? `:${message.column}` : ""}` : "";
      findings.push(finding(
        "ESLint",
        `${path}${position}`,
        message.fatal ? "block" : mode,
        `${String(message.message ?? "")}${message.ruleId ? ` (${message.ruleId})` : ""}`,
      ));
    }
  }
  return findings;
}

function reportOutput(text: string): void {
  if (process.env.PLUGIN_ROOT) {
    process.stderr.write(`${text}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: text,
    },
  })}\n`);
}

function formatFindings(findings: Finding[], omittedFiles: number): string {
  const lines = ["[Code Quality Guard] Source check results", ""];
  for (const item of findings) {
    lines.push(`- [${item.mode}] ${item.check}: ${item.path}`);
    lines.push(`  ${item.message}`);
  }
  if (omittedFiles > 0) lines.push(`- [report] ${omittedFiles} additional file(s) were not checked because of the immediate-check limit`);
  if (findings.some((item) => item.mode === "block")) {
    lines.push(
      "",
      "blockingContract:",
      "  observedFacts: Modified files contain reproducible syntax, parse, or blocking check errors.",
      "  harm: The relevant toolchain cannot reliably parse the current source.",
      "  unblockWhen: Fix every blocking finding and trigger the file check again.",
      "  recovery: Locate errors from the tool output; the hook ran after the write and will not roll files back automatically.",
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve(eventCwd(event));
  const discoveredRoot = resolveRepoRoot(cwd);
  const repoRoot = discoveredRoot ?? cwd;
  const config = resolveConfig(await loadUserConfig(discoveredRoot));
  const allTargets = extractFileTargets(event)
    .filter(existsSync)
    .filter(isSourceFileWithinLimit)
    .map((filePath) => ({
      filePath,
      path: repoRelativePath(filePath, repoRoot, cwd),
    }))
    .filter(({ path }) => !isSkippedPath(path));
  if (allTargets.length === 0) return;

  const state: QualityState = readState(event, repoRoot);
  recordPhpFiles(
    state,
    allTargets.filter(({ path }) => /\.php$/iu.test(path)).map(({ filePath }) => filePath),
  );

  const targets = allTargets.slice(0, config.limits.maxImmediateFiles);
  let omittedFiles = allTargets.length - targets.length;
  const deadline = Date.now() + Math.min(50000, config.limits.immediateTimeoutMs * 3);
  const findings: Finding[] = [];
  const tools = new Map<string, string | null>();
  const tool = (name: string, localPaths: readonly string[] = []): string | null => {
    const key = `${name}\0${localPaths.join("\0")}`;
    if (!tools.has(key)) tools.set(key, findExecutable(name, repoRoot, localPaths));
    return tools.get(key) ?? null;
  };
  const missing = (key: string, path: string, message: string): void => {
    if (config.missingTools === "silent") return;
    if (markMissingOnce(state, key)) findings.push(finding("Tool discovery", path, "report", message));
  };
  const run = (command: string, args: readonly string[]): Promise<CommandResult> => runCommand(command, args, {
    cwd: repoRoot,
    timeoutMs: config.limits.immediateTimeoutMs,
  });
  const commandFailure = (check: string, path: string, mode: CheckMode | string, result: CommandResult): boolean => {
    if (result.timedOut) {
      findings.push(finding(check, path, "report", `Check timed out after ${config.limits.immediateTimeoutMs}ms`));
      return true;
    }
    if (result.error) {
      findings.push(finding(check, path, "report", `Checker execution failed: ${result.error.message}`));
      return true;
    }
    if (result.code !== 0) {
      findings.push(finding(
        check,
        path,
        mode,
        capOutput(combinedOutput(result) || `Checker exit code ${result.code}`, config.limits.maxOutputLines),
      ));
      return true;
    }
    return false;
  };

  for (const [targetIndex, { filePath, path }] of targets.entries()) {
    if (Date.now() >= deadline) {
      omittedFiles += targets.length - targetIndex;
      break;
    }
    if (/\.(?:cjs|js|mjs)$/iu.test(path)) {
      const mode = modeFor("javascriptSyntax", path, config);
      if (mode !== "off") {
        const result = await run(process.execPath, ["--check", filePath]);
        commandFailure("JavaScript Syntax", path, mode, result);
      }
    }

    if (/\.(?:cts|mts|ts|tsx)$/iu.test(path)) {
      const mode = modeFor("typescriptSyntax", path, config);
      if (mode !== "off") {
        const executable = tool("esbuild", ["node_modules/.bin/esbuild"]);
        if (!executable) {
          missing("esbuild", path, "esbuild was not found locally or on PATH; skipped the TypeScript syntax check");
        } else {
          const devNull = process.platform === "win32" ? "NUL" : "/dev/null";
          const result = await run(executable, [filePath, "--log-level=error", `--outfile=${devNull}`]);
          commandFailure("TypeScript Syntax", path, mode, result);
        }
      }
    }

    if (ESLINT_PATH.test(path) && modeFor("eslint", path, config) !== "off") {
      const mode = modeFor("eslint", path, config);
      const executable = tool("eslint", ["node_modules/.bin/eslint"]);
      if (!executable) {
        missing("eslint", path, "ESLint was not found locally or on PATH; skipped linting");
      } else if (!hasEslintConfig(repoRoot)) {
        missing("eslint-config", path, "No ESLint configuration was found; skipped linting");
      } else {
        const result = await run(executable, [filePath, "--format", "json"]);
        if (result.timedOut || result.error || result.code === 2) {
          commandFailure("ESLint", path, "report", result);
        } else if (result.code !== 0 || result.stdout.trim()) {
          findings.push(...eslintMessages(result, path, mode));
        }
      }
    }

    if (/\.py$/iu.test(path)) {
      const syntaxMode = modeFor("pythonSyntax", path, config);
      if (syntaxMode !== "off") {
        const python = tool("python3", [".venv/bin/python", "venv/bin/python"])
          ?? tool("python", [".venv/bin/python", "venv/bin/python"]);
        if (!python) {
          missing("python", path, "Python was not found in the project environment or on PATH; skipped the syntax check");
        } else {
          const program = "import pathlib,sys; p=sys.argv[1]; compile(pathlib.Path(p).read_bytes(), p, 'exec')";
          const result = await run(python, ["-c", program, filePath]);
          commandFailure("Python Syntax", path, syntaxMode, result);
        }
      }
      const ruffMode = modeFor("ruff", path, config);
      if (ruffMode !== "off") {
        const ruff = tool("ruff", [".venv/bin/ruff", "venv/bin/ruff"]);
        if (!ruff) {
          missing("ruff", path, "Ruff was not found in the project environment or on PATH; skipped linting");
        } else {
          const result = await run(ruff, ["check", "--no-fix", "--output-format", "concise", filePath]);
          commandFailure("Ruff", path, result.code === 2 ? "report" : ruffMode, result);
        }
      }
    }

    if (/\.php$/iu.test(path)) {
      const mode = modeFor("phpSyntax", path, config);
      if (mode !== "off") {
        const php = tool("php");
        if (!php) {
          missing("php", path, "PHP was not found on PATH; skipped the syntax check");
        } else {
          const result = await run(php, ["-l", filePath]);
          commandFailure("PHP Syntax", path, mode, result);
        }
      }
    }

    if (path === "composer.json") {
      const mode = modeFor("composerValidate", path, config);
      if (mode !== "off") {
        const composer = tool("composer", ["vendor/bin/composer"]);
        if (!composer) {
          missing("composer", path, "Composer was not found locally or on PATH; skipped the configuration check");
        } else {
          const result = await run(composer, ["validate", "--no-check-publish", "--no-check-lock", filePath]);
          commandFailure("Composer Validate", path, mode, result);
        }
      }
    }
  }

  if (findings.length === 0 && omittedFiles === 0) return;
  const message = formatFindings(findings, omittedFiles);
  if (findings.some((item) => item.mode === "block")) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  } else {
    reportOutput(message);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
