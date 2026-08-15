import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  commandInvocation,
  splitShellLogicalLines,
  tokenizeShell,
} from "../lib/shell-parse.js";

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
    if (absolute === resolve(cwd) || /^(?:\.\/)?\*+(?:\/\*+)*$/u.test(expanded)) {
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

function expandPathToken(argument, cwd) {
  return argument
    .replace(/^\$\{HOME\}(?=\/|$)/u, homedir())
    .replace(/^\$HOME(?=\/|$)/u, homedir())
    .replace(/^~(?=\/|$)/u, homedir())
    .replace(/^\$\{PWD\}(?=\/|$)/u, cwd)
    .replace(/^\$PWD(?=\/|$)/u, cwd)
    .replace(/^\$\(pwd\)(?=\/|$)/u, cwd);
}

function broadDeleteReason(argument, cwd, verb) {
  const homeReference = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u.test(argument);
  const expanded = expandPathToken(argument, cwd);
  const absolute = resolve(cwd, expanded);
  if (/^\/+$/u.test(expanded)) return `${verb} / would delete the entire filesystem`;
  if (absolute === resolve(cwd) || expanded.startsWith("./*") || expanded === ".") {
    return `${verb} . would delete everything in the current directory`;
  }
  if (homeReference || absolute === homedir()) {
    return `${verb} ~ targets the home directory and is extremely dangerous`;
  }
  if (dirname(absolute) === "/" || /^\/\*+$/u.test(expanded)) {
    return `${verb} targeting a top-level directory such as /tmp or /home is extremely dangerous`;
  }
  return null;
}

function findDeleteReason(args, cwd) {
  if (!args.some((argument) => argument === "-delete")) return null;
  const paths = [];
  let optionsEnded = false;
  for (const argument of args) {
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && argument.startsWith("-")) continue;
    if (!argument.startsWith("-")) paths.push(argument);
  }
  if (paths.length === 0) {
    return "find -delete without an explicit path defaults to the current directory";
  }
  for (const argument of paths) {
    const reason = broadDeleteReason(argument, cwd, "find -delete");
    if (reason) return reason;
  }
  return null;
}

function dangerousCommandReason(command, cwd, depth = 0) {
  if (depth < 4) {
    for (const nestedCommand of nestedCommandSubstitutions(command)) {
      const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
      if (reason) return reason;
    }
  } else if (hasCommandSubstitution(command)) {
    return "nested command substitutions are too deep to prove the deletion scope safe";
  }
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
      if (invocation?.executable === "find") {
        const reason = findDeleteReason(invocation.args, cwd);
        if (reason) return reason;
      }
      if (invocation?.executable === "eval") {
        const nestedCommand = invocation.args.join(" ");
        if (nestedCommand) {
          if (depth >= 4) {
            return "nested eval commands are too deep to prove the deletion scope safe";
          }
          const reason = dangerousCommandReason(nestedCommand, cwd, depth + 1);
          if (reason) return reason;
        }
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

function hasCommandSubstitution(command) {
  return /\$\(|`/u.test(command);
}

function nestedCommandSubstitutions(command) {
  const nested = [];
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (char === "'") {
      quote = char;
      continue;
    }
    if (char === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (char === "`") {
      let end = index + 1;
      let body = "";
      for (; end < command.length; end += 1) {
        if (command[end] === "\\" && end + 1 < command.length) {
          body += command[end + 1];
          end += 1;
        } else if (command[end] === "`") break;
        else body += command[end];
      }
      if (end < command.length) {
        nested.push(body);
        index = end;
      }
      continue;
    }
    if (char !== "$" || command[index + 1] !== "(") continue;
    let depth = 1;
    let body = "";
    let nestedQuote = null;
    let end = index + 2;
    for (; end < command.length && depth > 0; end += 1) {
      const current = command[end];
      if (current === "\\") {
        if (end + 1 < command.length) body += `${current}${command[end + 1]}`;
        end += 1;
        continue;
      }
      if (nestedQuote) {
        if (current === nestedQuote) nestedQuote = null;
        body += current;
        continue;
      }
      if (current === "'" || current === '"') {
        nestedQuote = current;
        body += current;
        continue;
      }
      if (current === "(") depth += 1;
      if (current === ")") depth -= 1;
      if (depth > 0) body += current;
    }
    if (depth === 0) {
      nested.push(body);
      index = end - 1;
    }
  }
  return nested;
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
