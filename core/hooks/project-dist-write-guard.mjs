import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const DIRECT_PATH_KEYS = new Set([
  "dest",
  "destination",
  "file",
  "file_path",
  "filePath",
  "new_path",
  "newPath",
  "notebook_path",
  "notebookPath",
  "old_path",
  "oldPath",
  "output_path",
  "outputPath",
  "path",
  "target",
  "target_file",
  "target_path",
  "targetFile",
  "targetPath",
]);

const COMMAND_KEYS = ["chars", "cmd", "command", "script"];
const SHELL_MUTATORS = new Set([
  "chmod",
  "chown",
  "chgrp",
  "install",
  "mkdir",
  "mv",
  "patch",
  "rm",
  "rmdir",
  "touch",
  "truncate",
  "unlink",
]);
const DESTINATION_ONLY_COMMANDS = new Set(["cp", "install", "ln", "rsync"]);

function eventToolInput(event) {
  const value = event?.tool_input ?? event?.toolInput ?? event?.input;
  return value && typeof value === "object" ? value : {};
}

function eventCwd(event) {
  const value = event?.cwd ?? event?.working_directory ?? event?.workingDirectory;
  return typeof value === "string" && path.isAbsolute(value) ? value : PROJECT_ROOT;
}

function stripShellQuotes(value) {
  let result = value.trim().replace(/[;,]+$/u, "");
  if (
    result.length >= 2 &&
    ((result.startsWith("\"") && result.endsWith("\"")) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1);
  }
  return result;
}

function expandKnownRoots(value, cwd) {
  return value
    .replaceAll("${CLAUDE_PROJECT_DIR}", PROJECT_ROOT)
    .replaceAll("$CLAUDE_PROJECT_DIR", PROJECT_ROOT)
    .replaceAll("$(git rev-parse --show-toplevel)", PROJECT_ROOT)
    .replaceAll("`git rev-parse --show-toplevel`", PROJECT_ROOT)
    .replaceAll("$(pwd)", cwd)
    .replaceAll("${PWD}", cwd)
    .replaceAll("$PWD", cwd);
}

function resolveCandidate(rawValue, cwd) {
  if (typeof rawValue !== "string") return null;
  let value = stripShellQuotes(rawValue);
  if (!value || value === "/dev/null" || value.startsWith("-")) return null;
  if (/^(?:https?|data):/u.test(value)) return null;
  value = expandKnownRoots(value, cwd);
  if (/^[ab]\//u.test(value)) value = value.slice(2);
  return path.resolve(cwd, value);
}

function resolveThroughExistingAncestor(absolutePath) {
  const missingParts = [];
  let cursor = absolutePath;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return absolutePath;
    missingParts.unshift(path.basename(cursor));
    cursor = parent;
  }
  try {
    return path.join(realpathSync(cursor), ...missingParts);
  } catch {
    return absolutePath;
  }
}

function isPluginDistPath(absolutePath) {
  const candidates = [absolutePath, resolveThroughExistingAncestor(absolutePath)];
  return candidates.some((candidate) => {
    const relative = path.relative(PROJECT_ROOT, candidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
    const parts = relative.split(path.sep);
    return parts.length >= 3 && parts[0] === "plugins" && Boolean(parts[1]) && parts[2] === "dist";
  });
}

function collectDirectPaths(value, key, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectDirectPaths(item, key, output);
    return;
  }
  if (!value || typeof value !== "object") {
    if (DIRECT_PATH_KEYS.has(key) && typeof value === "string") output.push(value);
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    collectDirectPaths(childValue, childKey, output);
  }
}

function extractPatchPaths(input) {
  const patchValues = [input.patch, input.diff, input.patch_text, input.patchText]
    .filter((value) => typeof value === "string");
  const paths = [];
  const headerPattern = /^(?:\*\*\* (?:Add|Update|Delete) File:|\*\*\* Move to:|rename (?:from|to)|---|\+\+\+)\s+(.+)$/gmu;
  const diffPattern = /^diff --git\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s+(?:"([^"]+)"|'([^']+)'|(\S+))$/gmu;
  for (const patchValue of patchValues) {
    for (const match of patchValue.matchAll(headerPattern)) paths.push(match[1]);
    for (const match of patchValue.matchAll(diffPattern)) {
      paths.push(match[1] ?? match[2] ?? match[3]);
      paths.push(match[4] ?? match[5] ?? match[6]);
    }
  }
  return paths.filter((value) => typeof value === "string");
}

function shellWords(segment) {
  const matches = segment.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/gu) ?? [];
  return matches.map(stripShellQuotes);
}

function commandName(words) {
  let index = 0;
  while (index < words.length) {
    const word = words[index];
    if (!word) return { name: "", index };
    if (["command", "env", "sudo"].includes(word) || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(word)) {
      index += 1;
      continue;
    }
    return { name: path.basename(word.replace(/^\(+/u, "")), index };
  }
  return { name: "", index };
}

function pathLikeOperands(words, startIndex) {
  return words
    .slice(startIndex)
    .filter((word) => word && !word.startsWith("-") && !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(word));
}

function extractShellTargets(command, initialCwd) {
  const targets = [];
  let cwd = initialCwd;
  const segments = command.split(/&&|\|\||\||;|\n/gu);
  for (const segment of segments) {
    const words = shellWords(segment);
    const executable = commandName(words);
    if (!executable.name) continue;

    if (executable.name === "cd") {
      const target = words[executable.index + 1];
      const resolved = resolveCandidate(target, cwd);
      if (resolved) cwd = resolved;
      continue;
    }

    const redirectionPattern = /(?:\d*>>?|&>)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gu;
    for (const match of segment.matchAll(redirectionPattern)) {
      targets.push({ value: match[1] ?? match[2] ?? match[3], cwd });
    }

    const writerPattern = /\b(?:appendFile|appendFileSync|createWriteStream|open|writeFile|writeFileSync|writeTextFile|writeTextFileSync)\s*\(\s*["']([^"']+)["']/gu;
    for (const match of segment.matchAll(writerPattern)) targets.push({ value: match[1], cwd });
    const pathWriterPattern = /\bPath\s*\(\s*["']([^"']+)["']\s*\)\s*\.\s*(?:mkdir|rename|replace|touch|unlink|write_bytes|write_text)\b/gu;
    for (const match of segment.matchAll(pathWriterPattern)) targets.push({ value: match[1], cwd });

    for (const [index, word] of words.entries()) {
      const optionMatch = word.match(/^(?:--outdir|--outfile|--output|of)=(.+)$/u);
      if (optionMatch) targets.push({ value: optionMatch[1], cwd });
      if (["-o", "--outdir", "--outfile", "--output"].includes(word)) {
        targets.push({ value: words[index + 1], cwd });
      }
    }

    const operands = pathLikeOperands(words, executable.index + 1);
    if (DESTINATION_ONLY_COMMANDS.has(executable.name) && operands.length > 0) {
      targets.push({ value: operands.at(-1), cwd });
    } else if (
      ["perl", "sed"].includes(executable.name) &&
      words.some((word) => /^-[^-]*i/u.test(word) || word === "--in-place")
    ) {
      for (const operand of operands) targets.push({ value: operand, cwd });
    } else if (SHELL_MUTATORS.has(executable.name)) {
      for (const operand of operands) targets.push({ value: operand, cwd });
    } else if (executable.name === "tee") {
      for (const operand of operands) targets.push({ value: operand, cwd });
    } else if (
      executable.name === "git" &&
      ["checkout", "clean", "reset", "restore"].includes(words[executable.index + 1] ?? "")
    ) {
      for (const operand of operands.slice(1)) targets.push({ value: operand, cwd });
    } else if (executable.name === "find" && words.includes("-delete")) {
      for (const operand of operands) targets.push({ value: operand, cwd });
    } else if (
      ["tar", "unzip"].includes(executable.name) &&
      words.some((word) => /^(?:-[^-]*[xX]|--extract)$/u.test(word))
    ) {
      for (const operand of operands) targets.push({ value: operand, cwd });
    }
  }
  return targets;
}

function denyReason() {
  return [
    "[Project Dist Write Guard] 插件 dist/ 是构建产物，禁止直接修改。",
    "",
    "blockingContract:",
    "  observedFacts: 当前文件工具、补丁或 shell 命令会直接写入 plugins/<name>/dist/。",
    "  harm: 直接修改构建产物会让源码与提交的运行时代码失去可重现关系。",
    "  unblockWhen: 操作不再直接写入插件 dist/，并由项目构建命令生成产物。",
    "  recovery:",
    "    - 修改对应的 src/，再运行 npm run build。",
  ].join("\n");
}

export function evaluateEvent(event) {
  if (!event || typeof event !== "object") return { deny: false };
  const input = eventToolInput(event);
  const cwd = eventCwd(event);
  const candidates = [];
  collectDirectPaths(input, "", candidates);
  candidates.push(...extractPatchPaths(input));

  for (const key of COMMAND_KEYS) {
    const command = input[key];
    if (typeof command === "string") {
      for (const target of extractShellTargets(command, cwd)) {
        const resolved = resolveCandidate(target.value, target.cwd);
        if (resolved && isPluginDistPath(resolved)) return { deny: true, reason: denyReason() };
      }
    }
  }

  for (const candidate of candidates) {
    const resolved = resolveCandidate(candidate, cwd);
    if (resolved && isPluginDistPath(resolved)) return { deny: true, reason: denyReason() };
  }
  return { deny: false };
}

export async function runHook(input = process.stdin) {
  let text = "";
  for await (const chunk of input) text += chunk.toString();
  let event;
  try {
    event = JSON.parse(text);
  } catch (error) {
    process.stderr.write(`[Project Dist Write Guard] malformed hook input; fail-open: ${error.message}\n`);
    return;
  }
  const decision = evaluateEvent(event);
  if (!decision.deny) return;
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: decision.reason,
    },
  })}\n`);
}
