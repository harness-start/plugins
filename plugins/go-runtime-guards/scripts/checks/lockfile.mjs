/**
 * Go dependency lockfile guard (PreToolUse).
 * Failure mode: fail-closed (deny) with a blockingContract.
 */

import { basename } from "node:path";

export const LOCKFILE_NAMES = ["go.sum"].map((n) => n.toLowerCase());

function cleanPath(filePath) {
  return String(filePath ?? "").replaceAll("\\", "/").replace(/\/+$/u, "");
}

export function isDependencyLockfile(filePath) {
  const cleaned = cleanPath(filePath);
  if (!cleaned) return false;
  return LOCKFILE_NAMES.includes(basename(cleaned).toLowerCase());
}

function dependencyLockfileTargets(targets) {
  return [...new Set(targets.filter((t) => isDependencyLockfile(t)))];
}

function stripQuotes(token) {
  if (
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function tokenize(segment) {
  return segment.match(/"[^"]*"|'[^']*'|\S+/gu)?.map(stripQuotes) ?? [];
}

function commandSegments(command) {
  return command
    .split(/&&|\|\||[;|\n]/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function shellDependencyLockfileWriteTargets(command) {
  if (typeof command !== "string" || !command.trim()) return [];
  const targets = [];
  for (const segment of commandSegments(command)) {
    // redirect / tee into lockfile
    const redir = segment.match(/(?:>|>>)\s*([^\s;&|'"]+)/g) ?? [];
    for (const r of redir) {
      const path = r.replace(/^(?:>|>>)\s*/, "");
      if (isDependencyLockfile(path)) targets.push(path);
    }
    if (/\btee\b/i.test(segment)) {
      for (const token of tokenize(segment).slice(1)) {
        if (isDependencyLockfile(token)) targets.push(token);
      }
    }
  }
  return dependencyLockfileTargets(targets);
}

function canonicalToolName(toolName) {
  if (typeof toolName !== "string") return "";
  const lower = toolName.trim().toLowerCase();
  const map = {
    apply_patch: "ApplyPatch",
    applypatch: "ApplyPatch",
    write: "Write",
    edit: "Edit",
    multiedit: "MultiEdit",
    bash: "Bash",
    shell: "Shell",
    shell_command: "Shell",
    exec_command: "Shell",
    exec: "Shell",
    local_shell: "Shell",
    create_file: "Write",
    search_replace: "Edit",
  };
  return map[lower] || toolName;
}

function pathsFromPatch(patch) {
  if (typeof patch !== "string") return [];
  const paths = [];
  for (const line of patch.split("\n")) {
    const m = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/);
    if (m) paths.push(m[1].trim().replace(/\\n$/, ""));
  }
  return paths;
}

export function collectLockfileTargets({ toolName, input }) {
  const fileTargets = [];
  const name = canonicalToolName(toolName);
  switch (name) {
    case "Write":
    case "Edit":
    case "MultiEdit":
      if (input?.file_path) fileTargets.push(input.file_path);
      if (input?.path) fileTargets.push(input.path);
      break;
    case "ApplyPatch": {
      if (input?.file_path) fileTargets.push(input.file_path);
      if (input?.path) fileTargets.push(input.path);
      const blob = [input?.patch, input?.input, input?.command]
        .filter(Boolean)
        .join("\n");
      fileTargets.push(...pathsFromPatch(blob));
      break;
    }
    case "Bash":
    case "Shell":
      return shellDependencyLockfileWriteTargets(
        typeof input?.command === "string" ? input.command : input?.cmd ?? "",
      );
    default:
      break;
  }
  return dependencyLockfileTargets(fileTargets);
}

export function lockfileDenyMessage(targets) {
  const generatedBy = "go mod";
  return [
    `[Go Dependency Lockfile Guard] 已拦截依赖 lock 文件修改`,
    "",
    `目标：${targets.join(", ")}`,
    "",
    `lock 文件由 ${generatedBy} 生成，AI 不得直接编辑或通过 shell 写入。`,
    "如确需变更依赖，请让用户明确授权依赖更新流程，并通过包管理器重新生成 lock 文件。",
    "",
    "blockingContract:",
    "  observedFacts: 提议的输入直接写入依赖 lock 文件，或通过 shell 写入操作指向 lock 文件。",
    "  harm: 手写 lock 会使解析结果与包管理器生成状态脱节，安装不可复现。",
    "  unblockWhen: 写入目标不是 lock 文件，且依赖变更由包管理器完成。",
    `  recovery: 还原 lock 文件，使用 ${generatedBy} 重新锁定依赖。`,
  ].join("\n");
}
