import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  splitShellLogicalLines,
  tokenizeShell,
} from "../lib/shell-parse.mjs";

const COMMAND_SEPARATORS = new Set(["&&", "||", ";", "|", "&", "{", "}"]);
const EMPTY_OPTIONS = new Set();
const SIMPLE_COMMAND_WRAPPERS = new Set(["command", "exec", "nohup"]);
const SHELL_COMMANDS = new Set(["bash", "dash", "sh", "zsh"]);
const SUDO_OPTIONS_WITH_VALUE = new Set([
  "-C", "-D", "-g", "-h", "-p", "-R", "-T", "-u",
  "--chdir", "--close-from", "--group", "--host", "--prompt", "--role",
  "--type", "--user",
]);
const ENV_OPTIONS_WITH_VALUE = new Set([
  "-C", "-S", "-u", "--chdir", "--split-string", "--unset",
]);
const XARGS_OPTIONS_WITH_VALUE = new Set([
  "-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file",
  "--delimiter", "--eof", "--max-args", "--max-chars", "--max-lines",
  "--max-procs", "--replace",
]);

function skipWrapperOptions(tokens, start, optionsWithValue) {
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token?.startsWith("-")) break;
    if (token === "--") return index + 1;
    index += optionsWithValue.has(token) ? 2 : 1;
  }
  return index;
}

function commandInvocation(tokens) {
  let index = 0;
  let stdinDriven = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token)) {
      index += 1;
      continue;
    }
    if (SIMPLE_COMMAND_WRAPPERS.has(token)) {
      index = skipWrapperOptions(tokens, index + 1, EMPTY_OPTIONS);
      continue;
    }
    if (token === "sudo") {
      index = skipWrapperOptions(tokens, index + 1, SUDO_OPTIONS_WITH_VALUE);
      continue;
    }
    if (token === "env") {
      index = skipWrapperOptions(tokens, index + 1, ENV_OPTIONS_WITH_VALUE);
      continue;
    }
    if (token === "xargs") {
      stdinDriven = true;
      index = skipWrapperOptions(tokens, index + 1, XARGS_OPTIONS_WITH_VALUE);
      continue;
    }
    return {
      executable: token.split("/").at(-1) ?? token,
      args: tokens.slice(index + 1),
      stdinDriven,
    };
  }
  return null;
}

function recursiveRmTarget(args, cwd, stdinDriven) {
  const recursive = args.some(
    (argument) =>
      argument === "--recursive" ||
      (/^-[^-]*[rR]/u.test(argument) && argument !== "--"),
  );
  if (!recursive) return null;
  if (stdinDriven) {
    return "xargs 向 rm -r 动态注入路径，无法证明删除范围安全";
  }

  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;

    const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
    const expanded = argument
      .replace(/^\$\{HOME\}(?=\/|$)/u, homedir())
      .replace(/^\$HOME(?=\/|$)/u, homedir())
      .replace(/^~(?=\/|$)/u, homedir())
      .replace(/^\$\{PWD\}(?=\/|$)/u, cwd)
      .replace(/^\$PWD(?=\/|$)/u, cwd)
      .replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
    const absolute = resolve(cwd, expanded);
    if (/^\/+$/u.test(expanded)) return "rm -r / 会删除整个文件系统";
    if (absolute === resolve(cwd) || expanded.startsWith("./*")) {
      return "rm -r . 会删除当前目录所有内容";
    }
    if (homeReference || absolute === homedir()) {
      return "rm -r ~ 家目录极其危险";
    }
    if (dirname(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
      return "rm -r 顶层目录（如 /tmp /home）极其危险";
    }
  }
  return null;
}

function dangerousCommandReason(command, cwd, depth = 0) {
  for (const logicalLine of splitShellLogicalLines(command)) {
    const tokens = tokenizeShell(logicalLine);
    let segment = [];
    for (let index = 0; index <= tokens.length; index += 1) {
      const token = tokens[index];
      if (token !== undefined && !COMMAND_SEPARATORS.has(token)) {
        segment.push(token);
        continue;
      }
      const invocation = commandInvocation(segment);
      if (invocation?.executable === "rm") {
        const reason = recursiveRmTarget(
          invocation.args,
          cwd,
          invocation.stdinDriven,
        );
        if (reason) return reason;
      }
      if (invocation && SHELL_COMMANDS.has(invocation.executable)) {
        const commandIndex = invocation.args.findIndex((argument) =>
          /^-[^-]*c/u.test(argument),
        );
        const nestedCommand = invocation.args[commandIndex + 1];
        if (commandIndex >= 0 && nestedCommand) {
          if (depth >= 4) {
            return "嵌套 shell -c 命令层级过深，无法证明删除范围安全";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
      }
      segment = [];
    }
  }
  return null;
}

export function dangerousCommandHits(command, cwd = process.cwd()) {
  if (typeof command !== "string" || !command) return [];
  const reason = dangerousCommandReason(command, cwd);
  return reason ? [reason] : [];
}

export function dangerousCommandDenyMessage(hits, command = "") {
  const reasons = Array.isArray(hits) ? hits : [];
  return [
    "[Dangerous Command] 已拦截高危命令",
    "",
    `原因：${reasons.join("；") || "命令的删除范围无法证明安全"}`,
    `命令：${command}`,
    "",
    "blockingContract:",
    "  observedFacts: 解析后的 shell 命令会递归删除文件系统根、家目录、工作区根或同等宽泛的目标。",
    "  harm: 执行该命令可能不可逆地删除用户数据或整个工作环境。",
    "  unblockWhen: 删除目标已解析为明确、狭窄且经过核对的路径，或移除破坏性命令。",
    "  recovery: 先解析目标文件，优先使用可恢复的移动/回收站操作，再以明确窄路径重试。",
  ].join("\n");
}
