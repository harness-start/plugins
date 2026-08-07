#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  capOutput,
  findExecutable,
  hasPhpstanConfig,
  loadUserConfig,
  markMissingOnce,
  modeFor,
  readState,
  repoRelativePath,
  resolveConfig,
  resolveRepoRoot,
  runCommand,
  writeState,
} from "./lib/code-quality-core.mjs";

function warn(message) {
  process.stderr.write(`[code-quality-guard] ${message}\n`);
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

function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

function outputReport(message) {
  process.stderr.write(`${message}\n`);
}

function stopBlock(message) {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason: message })}\n`);
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError || event?.stop_hook_active === true || event?.stopHookActive === true) return;
  const cwd = resolve(extractCwd(event));
  const discoveredRoot = resolveRepoRoot(cwd);
  const repoRoot = discoveredRoot ?? cwd;
  const config = resolveConfig(await loadUserConfig(discoveredRoot));
  const state = readState(event, repoRoot);
  const candidates = state.phpFiles
    .filter(existsSync)
    .map((filePath) => ({ filePath, path: repoRelativePath(filePath, repoRoot, cwd) }));
  if (candidates.length === 0) return;

  const enabled = candidates.filter(({ path }) => modeFor("phpstan", path, config) !== "off");
  if (enabled.length === 0) {
    state.phpFiles = [];
    writeState(state);
    return;
  }
  if (!hasPhpstanConfig(repoRoot)) {
    if (config.missingTools === "report-once" && markMissingOnce(state, "phpstan-config")) {
      outputReport("[Code Quality Guard] No PHPStan configuration was found; skipped batch static analysis for this session");
    }
    return;
  }
  const phpstan = findExecutable("phpstan", repoRoot, ["vendor/bin/phpstan"]);
  if (!phpstan) {
    if (config.missingTools === "report-once" && markMissingOnce(state, "phpstan")) {
      outputReport("[Code Quality Guard] PHPStan was not found locally or on PATH; skipped batch static analysis for this session");
    }
    return;
  }

  const selected = enabled.slice(0, config.limits.maxPhpstanFiles);
  const omitted = enabled.length - selected.length;
  const groups = [
    { mode: "block", files: selected.filter(({ path }) => modeFor("phpstan", path, config) === "block") },
    { mode: "report", files: selected.filter(({ path }) => modeFor("phpstan", path, config) === "report") },
  ];
  const findings = [];
  for (const group of groups) {
    if (group.files.length === 0) continue;
    const result = await runCommand(
      phpstan,
      ["analyse", "--no-progress", "--error-format=raw", ...group.files.map(({ filePath }) => filePath)],
      { cwd: repoRoot, timeoutMs: config.limits.phpstanTimeoutMs },
    );
    if (result.timedOut) {
      findings.push({ mode: "report", message: `PHPStan timed out after ${config.limits.phpstanTimeoutMs}ms` });
    } else if (result.error) {
      findings.push({ mode: "report", message: `PHPStan execution failed: ${result.error.message}` });
    } else if (result.code !== 0) {
      findings.push({
        mode: result.code === 1 ? group.mode : "report",
        message: capOutput(
          [result.stdout, result.stderr].filter((value) => value?.trim()).join("\n") || `PHPStan exit code ${result.code}`,
          config.limits.maxOutputLines,
        ),
      });
    }
  }

  state.phpFiles = [];
  writeState(state);
  if (findings.length === 0 && omitted === 0) return;
  const message = [
    "[Code Quality Guard] PHPStan batch check results",
    "",
    ...findings.flatMap((item) => [`- [${item.mode}] PHPStan`, ...item.message.split("\n").map((line) => `  ${line}`)]),
    ...(omitted > 0 ? [`- [report] ${omitted} additional PHP file(s) were not checked because of the batch limit`] : []),
  ].join("\n");
  if (findings.some((item) => item.mode === "block")) stopBlock(message);
  else outputReport(message);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error.message}`);
    process.exit(0);
  });
}
