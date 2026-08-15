#!/usr/bin/env node
// harness-source-hash: sha256:e5106d73638b3797ce9e88b8fae0df435d8ba82d9ceaa5377b906564cc62cb67
import {
  capOutput,
  eventCwd,
  eventToolInput,
  eventToolName,
  findExecutable,
  hasEslintConfig,
  isRecord,
  isSkippedPath,
  isSourceFileWithinLimit,
  loadUserConfig,
  markMissingOnce,
  modeFor,
  readState,
  readStdinJson,
  recordPhpFiles,
  repoRelativePath,
  resolveConfig,
  resolveRepoRoot,
  runCommand
} from "../chunks/chunk-YIJIYNLQ.mjs";

// plugins/code-quality-guard/src/entries/hooks/code-quality-post.ts
import { existsSync } from "node:fs";
import { isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// core/src/hook-targets.ts
import { isAbsolute, resolve } from "node:path";
var FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write"
]);
var READ_TOOLS = /* @__PURE__ */ new Set(["read"]);
var SHELL_TOOLS = /* @__PURE__ */ new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand"
]);
var PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "target_file",
  "output_file",
  "outputFile",
  "notebook_path",
  "notebookPath"
];
function canonicalToolName(name) {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}
function isFileMutationTool(name) {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
}
function isReadTool(name) {
  return READ_TOOLS.has(canonicalToolName(name));
}
function isShellTool(name) {
  return SHELL_TOOLS.has(canonicalToolName(name));
}
function extractShellCommand(event) {
  if (!isShellTool(eventToolName(event))) return null;
  const input = eventToolInput(event);
  const command = input.command ?? input.cmd ?? input.script;
  return typeof command === "string" ? command : null;
}
function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}
function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const record = input;
  const paths = [];
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(record.edits)) {
    for (const edit of record.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}
function patchPaths(payload) {
  const paths = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripMatchingQuotes(file[1]));
    if (move?.[1]) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}
function patchPayload(input) {
  if (typeof input === "string") return input;
  return [input.patch, input.input, input.command].filter((value) => typeof value === "string").join("\n");
}
function resolveTargets(raw, cwd) {
  return [...new Set(
    raw.map(stripMatchingQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))
  )];
}
function shellWritePaths(command) {
  const paths = [];
  const push = (raw) => {
    const value = stripMatchingQuotes(String(raw ?? ""));
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) {
    push(match[1]);
  }
  return paths;
}
function acceptsTool(name, tools) {
  if (tools === "any") return true;
  if (isFileMutationTool(name)) return true;
  if (tools === "read-or-mutation" && isReadTool(name)) return true;
  return false;
}
function extractFileTargets(event, options = {}) {
  const tools = options.tools ?? "mutation";
  const name = eventToolName(event);
  const cwd = resolve(eventCwd(event));
  const input = eventToolInput(event);
  const raw = [];
  if (acceptsTool(name, tools)) {
    raw.push(...objectPaths(input));
    raw.push(...patchPaths(patchPayload(typeof event.tool_input === "string" ? event.tool_input : input)));
    if (typeof event.tool_input === "string") raw.push(...objectPaths(input));
  }
  if (options.includeShellWrites) {
    const command = extractShellCommand(event) ?? (typeof input.command === "string" ? input.command : null) ?? (typeof input.cmd === "string" ? input.cmd : null) ?? (typeof input.script === "string" ? input.script : null);
    if (command) raw.push(...shellWritePaths(command));
  }
  return resolveTargets(raw, cwd);
}

// plugins/code-quality-guard/src/entries/hooks/code-quality-post.ts
function extractShellWriteTargets(command) {
  const text = String(command ?? "");
  const paths = [];
  const push = (raw) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of text.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of text.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  return [...new Set(paths)];
}
var ESLINT_PATH = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu;
function warn(message) {
  process.stderr.write(`[code-quality-guard] ${message}
`);
}
function extractFileTargets2(event) {
  if (isShellTool(eventToolName(event))) {
    const cwd = eventCwd(event);
    return [...new Set(
      extractShellWriteTargets(extractShellCommand(event) ?? "").filter(Boolean).map((path) => isAbsolute2(path) ? resolve2(path) : resolve2(cwd, path.replace(/^\.\//u, "")))
    )];
  }
  if (!isFileMutationTool(eventToolName(event))) return [];
  return extractFileTargets(event);
}
function combinedOutput(result) {
  return [result.stdout, result.stderr].filter((value) => value?.trim()).join("\n").trim();
}
function finding(check, path, mode, message) {
  return { check, path, mode, message };
}
function eslintMessages(result, path, mode) {
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "[]");
  } catch {
    return [finding("ESLint", path, "report", combinedOutput(result) || "ESLint returned no parseable JSON")];
  }
  const findings = [];
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
        `${String(message.message ?? "")}${message.ruleId ? ` (${message.ruleId})` : ""}`
      ));
    }
  }
  return findings;
}
function reportOutput(text) {
  if (process.env.PLUGIN_ROOT) {
    process.stderr.write(`${text}
`);
    return;
  }
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: text
    }
  })}
`);
}
function formatFindings(findings, omittedFiles) {
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
      "  recovery: Locate errors from the tool output; the hook ran after the write and will not roll files back automatically."
    );
  }
  return lines.join("\n");
}
async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve2(eventCwd(event));
  const discoveredRoot = resolveRepoRoot(cwd);
  const repoRoot = discoveredRoot ?? cwd;
  const config = resolveConfig(await loadUserConfig(discoveredRoot));
  const allTargets = extractFileTargets2(event).filter(existsSync).filter(isSourceFileWithinLimit).map((filePath) => ({
    filePath,
    path: repoRelativePath(filePath, repoRoot, cwd)
  })).filter(({ path }) => !isSkippedPath(path));
  if (allTargets.length === 0) return;
  const state = readState(event, repoRoot);
  recordPhpFiles(
    state,
    allTargets.filter(({ path }) => /\.php$/iu.test(path)).map(({ filePath }) => filePath)
  );
  const targets = allTargets.slice(0, config.limits.maxImmediateFiles);
  let omittedFiles = allTargets.length - targets.length;
  const deadline = Date.now() + Math.min(5e4, config.limits.immediateTimeoutMs * 3);
  const findings = [];
  const tools = /* @__PURE__ */ new Map();
  const tool = (name, localPaths = []) => {
    const key = `${name}\0${localPaths.join("\0")}`;
    if (!tools.has(key)) tools.set(key, findExecutable(name, repoRoot, localPaths));
    return tools.get(key) ?? null;
  };
  const missing = (key, path, message2) => {
    if (config.missingTools === "silent") return;
    if (markMissingOnce(state, key)) findings.push(finding("Tool discovery", path, "report", message2));
  };
  const run = (command, args) => runCommand(command, args, {
    cwd: repoRoot,
    timeoutMs: config.limits.immediateTimeoutMs
  });
  const commandFailure = (check, path, mode, result) => {
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
        capOutput(combinedOutput(result) || `Checker exit code ${result.code}`, config.limits.maxOutputLines)
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
        const python = tool("python3", [".venv/bin/python", "venv/bin/python"]) ?? tool("python", [".venv/bin/python", "venv/bin/python"]);
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
    process.stderr.write(`${message}
`);
    process.exitCode = 2;
  } else {
    reportOutput(message);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve2(process.argv[1])) {
  main().catch((error) => {
    warn(`hook failed open: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  });
}
export {
  extractFileTargets2 as extractFileTargets
};
