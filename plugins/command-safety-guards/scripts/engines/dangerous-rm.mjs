import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  commandInvocation,
  splitShellLogicalLines,
  tokenizeShell,
} from "../lib/shell-parse.mjs";

const COMMAND_SEPARATORS = new Set(["&&", "||", ";", "|", "&", "{", "}"]);
const SHELL_COMMANDS = new Set(["bash", "dash", "sh", "zsh"]);

function recursiveRmTarget(args, cwd, stdinDriven) {
  const recursive = args.some(
    (argument) =>
      argument === "--recursive" ||
      (/^-[^-]*[rR]/u.test(argument) && argument !== "--"),
  );
  if (!recursive) return null;
  if (stdinDriven) {
    return "xargs dynamically supplies paths to rm -r, so the deletion scope cannot be proven safe";
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
    if (/^\/+$/u.test(expanded)) return "rm -r / would delete the entire filesystem";
    if (absolute === resolve(cwd) || expanded.startsWith("./*")) {
      return "rm -r . would delete everything in the current directory";
    }
    if (homeReference || absolute === homedir()) {
      return "rm -r ~ targets the home directory and is extremely dangerous";
    }
    if (dirname(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
      return "rm -r targeting a top-level directory such as /tmp or /home is extremely dangerous";
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
            return "nested shell -c commands are too deep to prove the deletion scope safe";
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
    "[Dangerous Command] High-risk command blocked",
    "",
    `Reason: ${reasons.join("; ") || "the command's deletion scope cannot be proven safe"}`,
    `Command: ${command}`,
    "",
    "blockingContract:",
    "  observedFacts: The parsed shell command recursively deletes the filesystem root, home directory, workspace root, or an equivalently broad target.",
    "  harm: Running this command could irreversibly delete user data or the entire working environment.",
    "  unblockWhen: The deletion target resolves to a specific, narrow, verified path, or the destructive command is removed.",
    "  recovery: Resolve the target files first, prefer a recoverable move or trash operation, then retry with an explicit narrow path.",
  ].join("\n");
}
