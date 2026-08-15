import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

function isInsideProject(candidate) {
  const resolved = resolveThroughExistingAncestor(candidate);
  const project = resolveThroughExistingAncestor(PROJECT_ROOT);
  const relative = path.relative(project, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function gitSubcommand(words, executableIndex, initialCwd) {
  let cwd = initialCwd;
  let index = executableIndex + 1;
  while (index < words.length) {
    const word = words[index];
    if (word === "-C") {
      const resolved = resolveCandidate(words[index + 1], cwd);
      if (resolved) cwd = resolved;
      index += 2;
      continue;
    }
    if (["-c", "--config-env", "--exec-path", "--git-dir", "--namespace", "--work-tree"].includes(word)) {
      index += 2;
      continue;
    }
    if (word?.startsWith("-")) {
      index += 1;
      continue;
    }
    return { cwd, name: word ?? "" };
  }
  return { cwd, name: "" };
}

function containsProjectRemotePush(command, initialCwd) {
  let cwd = initialCwd;
  const segments = command.split(/&&|\|\||\||;|\n/gu);
  for (const segment of segments) {
    const words = shellWords(segment);
    const executable = commandName(words);
    if (!executable.name) continue;
    if (executable.name === "cd") {
      const resolved = resolveCandidate(words[executable.index + 1], cwd);
      if (resolved) cwd = resolved;
      continue;
    }
    if (executable.name === "git") {
      const command = gitSubcommand(words, executable.index, cwd);
      if (["push", "send-pack"].includes(command.name) && isInsideProject(command.cwd)) return true;
    } else if (executable.name === "git-send-pack" && isInsideProject(cwd)) {
      return true;
    }
  }
  return false;
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

function rebuiltPushReason(details) {
  return [
    "[Project Dist Write Guard] 检测到 src/ 与 dist/ 不一致，已自动重建；本次 push 已停止。",
    "",
    details.trim(),
    "",
    "blockingContract:",
    "  observedFacts: 构建命令刷新了一个或多个 plugins/<name>/dist/ 文件。",
    "  harm: 直接继续 push 不会把工作区中新生成但尚未提交的 dist/ 带入远端提交。",
    "  unblockWhen: 提交自动重建的 dist/，并重试原 git push。",
    "  recovery:",
    "    - 检查并提交 src/ 与对应 dist/ 的变更。",
    "    - 重试原 git push 命令。",
  ].filter(Boolean).join("\n");
}

function failedPushReason(details) {
  return [
    "[Project Dist Write Guard] push 前的 dist 校验或重建失败，本次 push 已停止。",
    "",
    details.trim(),
    "",
    "blockingContract:",
    "  observedFacts: npm run ensure:dist 未成功完成。",
    "  harm: 无法证明远端提交中的 src/ 与 dist/ 对应。",
    "  unblockWhen: 修复构建错误，确保 npm run ensure:dist 成功，再重试 push。",
    "  recovery:",
    "    - 运行 npm run ensure:dist 并修复报告的错误。",
  ].filter(Boolean).join("\n");
}

function uncommittedPushReason(details) {
  return [
    "[Project Dist Write Guard] dist/ 已与当前 src/ 对应，但生成文件尚未全部提交，本次 push 已停止。",
    "",
    details.trim(),
    "",
    "blockingContract:",
    "  observedFacts: plugins/<name>/dist/ 相对 HEAD 仍有 staged、unstaged 或 untracked 变更。",
    "  harm: git push 不会把尚未提交的生成文件带入远端提交。",
    "  unblockWhen: 提交对应的 dist/ 变更，并重试原 git push。",
    "  recovery:",
    "    - 使用 git status 检查并提交生成文件。",
    "    - 重试原 git push 命令。",
  ].filter(Boolean).join("\n");
}

function summarizeChangedDist(statusOutput) {
  const lines = statusOutput.trim().split("\n").filter(Boolean);
  const preview = lines.slice(0, 20);
  if (lines.length > preview.length) preview.push(`... 另有 ${lines.length - preview.length} 个 dist/ 变更`);
  return preview.join("\n");
}

export async function ensureProjectDist() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "ensure:dist", "--silent"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });
  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.error || result.status !== 0) {
    const error = result.error?.message ?? `npm run ensure:dist exited with status ${result.status}`;
    return { status: "failed", details: [details, error].filter(Boolean).join("\n") };
  }
  const rebuilt = result.stdout
    .split("\n")
    .filter((line) => /^rebuilt\s+/u.test(line))
    .join("\n");
  const status = spawnSync("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ":(glob)plugins/*/dist/**",
  ], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (status.error || status.status !== 0) {
    const error = status.error?.message ?? `git status exited with status ${status.status}`;
    return { status: "failed", details: [status.stderr, error].filter(Boolean).join("\n") };
  }
  const changedDist = summarizeChangedDist(status.stdout);
  if (!changedDist) return { status: "current", details: "" };
  return {
    status: rebuilt ? "rebuilt" : "uncommitted",
    details: [rebuilt, changedDist].filter(Boolean).join("\n"),
  };
}

export function evaluateEvent(event) {
  if (!event || typeof event !== "object") return { deny: false };
  const input = eventToolInput(event);
  const cwd = eventCwd(event);
  const candidates = [];
  let ensureDist = false;
  collectDirectPaths(input, "", candidates);
  candidates.push(...extractPatchPaths(input));

  for (const key of COMMAND_KEYS) {
    const command = input[key];
    if (typeof command === "string") {
      if (containsProjectRemotePush(command, cwd)) ensureDist = true;
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
  return ensureDist ? { deny: false, ensureDist: true } : { deny: false };
}

export async function runHook(input = process.stdin, options = {}) {
  const ensure = options.ensureProjectDist ?? ensureProjectDist;
  const writeStdout = options.writeStdout ?? ((value) => process.stdout.write(value));
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
  let reason;
  if (decision.deny) reason = decision.reason;
  else if (decision.ensureDist) {
    const result = await ensure();
    if (result.status === "rebuilt") reason = rebuiltPushReason(result.details);
    else if (result.status === "uncommitted") reason = uncommittedPushReason(result.details);
    else if (result.status === "failed") reason = failedPushReason(result.details);
  }
  if (!reason) return;
  writeStdout(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })}\n`);
}
