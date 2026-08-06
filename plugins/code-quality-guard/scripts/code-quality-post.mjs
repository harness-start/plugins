#!/usr/bin/env node

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
} from "./lib/code-quality-core.mjs";

const FILE_TOOLS = new Set(["applypatch", "edit", "multiedit", "notebookedit", "write"]);
const ESLINT_PATH = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/iu;

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

function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) return text.slice(1, -1);
  return text;
}

function nestedPaths(input) {
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
  if (Array.isArray(input.edits)) input.edits.forEach((edit) => paths.push(...nestedPaths(edit)));
  return paths;
}

export function extractFileTargets(event) {
  const toolName = String(extractToolName(event)).replaceAll("_", "").toLowerCase();
  if (!FILE_TOOLS.has(toolName)) return [];
  const input = extractToolInput(event);
  const cwd = extractCwd(event);
  const paths = nestedPaths(input);
  const patch = typeof input === "string"
    ? input
    : [input?.patch, input?.input, input?.command]
        .filter((value) => typeof value === "string")
        .join("\n");
  for (const line of patch.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file) paths.push(stripMatchingQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) paths.push(stripMatchingQuotes(move[1]));
  }
  return [...new Set(paths.map(stripMatchingQuotes).filter(Boolean).map((path) =>
    isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")),
  ))];
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
    return [finding("ESLint", path, "report", combinedOutput(result) || "ESLint 未返回可解析的 JSON")];
  }
  const findings = [];
  for (const file of parsed) {
    for (const message of file.messages ?? []) {
      const position = message.line ? `:${message.line}${message.column ? `:${message.column}` : ""}` : "";
      findings.push(finding(
        "ESLint",
        `${path}${position}`,
        message.fatal ? "block" : mode,
        `${message.message}${message.ruleId ? ` (${message.ruleId})` : ""}`,
      ));
    }
  }
  return findings;
}

function reportOutput(text) {
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

function formatFindings(findings, omittedFiles) {
  const lines = ["[Code Quality Guard] 源码检查结果", ""];
  for (const item of findings) {
    lines.push(`- [${item.mode}] ${item.check}: ${item.path}`);
    lines.push(`  ${item.message}`);
  }
  if (omittedFiles > 0) lines.push(`- [report] 本次另有 ${omittedFiles} 个文件因即时检查上限未执行`);
  if (findings.some((item) => item.mode === "block")) {
    lines.push(
      "",
      "blockingContract:",
      "  observedFacts: 修改后的文件存在可复现的语法、解析或阻断级检查错误。",
      "  harm: 当前源码无法被对应工具链可靠解析。",
      "  unblockWhen: 修复所有 block 项并重新触发文件检查。",
      "  recovery: 按工具输出定位错误；Hook 已在写入后运行，不会自动回滚文件。",
    );
  }
  return lines.join("\n");
}

async function main() {
  const event = await readStdinJson();
  if (event.__parseError) return;
  const cwd = resolve(extractCwd(event));
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

  const state = readState(event, repoRoot);
  recordPhpFiles(
    state,
    allTargets.filter(({ path }) => /\.php$/iu.test(path)).map(({ filePath }) => filePath),
  );

  const targets = allTargets.slice(0, config.limits.maxImmediateFiles);
  let omittedFiles = allTargets.length - targets.length;
  const deadline = Date.now() + Math.min(50000, config.limits.immediateTimeoutMs * 3);
  const findings = [];
  const tools = new Map();
  const tool = (name, localPaths = []) => {
    const key = `${name}\0${localPaths.join("\0")}`;
    if (!tools.has(key)) tools.set(key, findExecutable(name, repoRoot, localPaths));
    return tools.get(key);
  };
  const missing = (key, path, message) => {
    if (config.missingTools === "silent") return;
    if (markMissingOnce(state, key)) findings.push(finding("Tool discovery", path, "report", message));
  };
  const run = (command, args) => runCommand(command, args, {
    cwd: repoRoot,
    timeoutMs: config.limits.immediateTimeoutMs,
  });
  const commandFailure = (check, path, mode, result) => {
    if (result.timedOut) {
      findings.push(finding(check, path, "report", `检查在 ${config.limits.immediateTimeoutMs}ms 后超时`));
      return true;
    }
    if (result.error) {
      findings.push(finding(check, path, "report", `检查器执行失败：${result.error.message}`));
      return true;
    }
    if (result.code !== 0) {
      findings.push(finding(
        check,
        path,
        mode,
        capOutput(combinedOutput(result) || `检查器退出码 ${result.code}`, config.limits.maxOutputLines),
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
          missing("esbuild", path, "未找到项目本地或 PATH 中的 esbuild，TypeScript 语法检查已跳过");
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
        missing("eslint", path, "未找到项目本地或 PATH 中的 ESLint，lint 已跳过");
      } else if (!hasEslintConfig(repoRoot)) {
        missing("eslint-config", path, "未找到 ESLint 配置，lint 已跳过");
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
          missing("python", path, "未找到项目虚拟环境或 PATH 中的 Python，语法检查已跳过");
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
          missing("ruff", path, "未找到项目虚拟环境或 PATH 中的 Ruff，lint 已跳过");
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
          missing("php", path, "未找到 PATH 中的 PHP，语法检查已跳过");
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
          missing("composer", path, "未找到项目本地或 PATH 中的 Composer，配置检查已跳过");
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
  main().catch((error) => {
    warn(`hook failed open: ${error.message}`);
    process.exit(0);
  });
}
