#!/usr/bin/env node
// harness-source-hash: sha256:acd8d96ea4591b1c7cadc51352e1500df1c0d0ef0d1dce43bd449d3c8748a09b
import {
  capOutput,
  eventCwd,
  findExecutable,
  hasPhpstanConfig,
  isStopHookActive,
  loadUserConfig,
  markMissingOnce,
  modeFor,
  readState,
  readStdinJson,
  repoRelativePath,
  resolveConfig,
  resolveRepoRoot,
  runCommand,
  writeState
} from "../chunks/chunk-FTHJWBLS.mjs";

// plugins/code-quality-guard/src/entries/hooks/code-quality-stop.ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/hook-output.ts
function stopBlock(reason) {
  return { decision: "block", reason };
}
function writeJson(value) {
  if (value !== null && value !== void 0) {
    process.stdout.write(`${JSON.stringify(value)}
`);
  }
}

// plugins/code-quality-guard/src/entries/hooks/code-quality-stop.ts
function warn(message) {
  process.stderr.write(`[code-quality-guard] ${message}
`);
}
function outputReport(message) {
  process.stderr.write(`${message}
`);
}
async function main() {
  const event = await readStdinJson();
  if (event.__parseError || isStopHookActive(event)) return;
  const cwd = resolve(eventCwd(event));
  const discoveredRoot = resolveRepoRoot(cwd);
  const repoRoot = discoveredRoot ?? cwd;
  const config = resolveConfig(await loadUserConfig(discoveredRoot));
  const state = readState(event, repoRoot);
  const candidates = state.phpFiles.filter(existsSync).map((filePath) => ({ filePath, path: repoRelativePath(filePath, repoRoot, cwd) }));
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
    { mode: "report", files: selected.filter(({ path }) => modeFor("phpstan", path, config) === "report") }
  ];
  const findings = [];
  for (const group of groups) {
    if (group.files.length === 0) continue;
    const result = await runCommand(
      phpstan,
      ["analyse", "--no-progress", "--error-format=raw", ...group.files.map(({ filePath }) => filePath)],
      { cwd: repoRoot, timeoutMs: config.limits.phpstanTimeoutMs }
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
          config.limits.maxOutputLines
        )
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
    ...omitted > 0 ? [`- [report] ${omitted} additional PHP file(s) were not checked because of the batch limit`] : []
  ].join("\n");
  if (findings.some((item) => item.mode === "block")) writeJson(stopBlock(message));
  else outputReport(message);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error.message}`);
    process.exit(0);
  });
}
