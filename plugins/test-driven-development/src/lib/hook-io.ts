import { basename, isAbsolute, join, relative, resolve } from "node:path";

import {
  eventCwd,
  eventToolInput,
  eventToolName,
  isRecord,
  readStdinJson,
  type HookEvent,
  type HookToolInput,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, writeJson } from "@harness/core/hook-output";
import { canonicalToolName, extractShellCommand, isFileMutationTool, isShellTool } from "@harness/core/hook-targets";
import { shellCommandInvocations } from "@harness/core/shell-parse";

export { additionalContext, readStdinJson, preToolDeny, writeJson };

export function cwdOf(event: HookEvent): string {
  const raw = event.cwd ?? event.working_directory ?? event.workingDirectory;
  if (raw !== undefined && raw !== null && typeof raw !== "string") return resolve(raw as string);
  return resolve(eventCwd(event));
}
export function toolNameOf(event: HookEvent): string {
  return canonicalToolName(eventToolName(event));
}
export function toolInputOf(event: HookEvent): HookToolInput {
  return eventToolInput(event);
}
export function shellCommandOf(event: HookEvent): string | null {
  return extractShellCommand(event);
}

function stripQuotes(value: unknown): string {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1);
  return text;
}

function nestedPaths(input: unknown): string[] {
  if (!isRecord(input)) return [];
  const paths: string[] = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "notebook_path"]) {
    const value = input[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...nestedPaths(edit));
  return paths;
}

function patchPaths(input: unknown): string[] {
  const text = patchText(input);
  const paths: string[] = [];
  for (const line of text.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move?.[1]) paths.push(stripQuotes(move[1]));
  }
  return paths;
}

function patchText(input: unknown): string {
  if (typeof input === "string") return input;
  if (!isRecord(input)) return "";
  return [input.patch, input.input, input.command].filter((value): value is string => typeof value === "string").join("\n");
}

function contentFromPatch(input: unknown, target: string, cwd: string, currentText: string): string {
  const targetPath = resolve(target);
  let active = false;
  let targetMode = "";
  const added: string[] = [];
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+(Add|Update|Delete) File:\s+(.+)$/u);
    if (file?.[1] && file[2]) {
      active = resolve(cwd, stripQuotes(file[2])) === targetPath;
      if (active) targetMode = file[1].toLowerCase();
      continue;
    }
    if (/^\*\*\*\s+/u.test(line)) {
      active = false;
      continue;
    }
    if (active && line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
  }
  if (targetMode === "add" && added.length > 0) return added.join("\n");
  if (targetMode === "update" && added.length > 0) return `${currentText}\n${added.join("\n")}`;
  return currentText;
}

function invocations(command: unknown, names: Set<string>): string[][] {
  const found: string[][] = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (!names.has(invocation.executable)) continue;
    const operands: string[] = [];
    let optionsEnded = false;
    for (const token of invocation.args) {
      if (!optionsEnded && token === "--") {
        optionsEnded = true;
        continue;
      }
      if (!optionsEnded && token.startsWith("-")) continue;
      if (token) operands.push(token);
    }
    found.push(operands);
  }
  return found;
}

function sedInPlacePaths(command: unknown): string[] {
  const paths: string[] = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (invocation.executable !== "sed") continue;
    const args = invocation.args;
    let inPlace = false;
    let programFromOption = false;
    const positional: string[] = [];
    for (let cursor = 0; cursor < args.length; cursor += 1) {
      const argument = args[cursor] ?? "";
      if (argument === "--") {
        positional.push(...args.slice(cursor + 1).filter(Boolean));
        break;
      }
      if (argument === "-i" || /^-[^-]*i/u.test(argument) || argument === "--in-place" || argument.startsWith("--in-place=")) {
        inPlace = true;
        if (argument === "-i" && /^(?:|\.[^/]+)$/u.test(args[cursor + 1] ?? "")) cursor += 1;
        continue;
      }
      if (argument === "-e" || argument === "--expression" || argument === "-f" || argument === "--file") {
        programFromOption = true;
        cursor += 1;
        continue;
      }
      if (/^(?:-e|--expression=|-f|--file=)/u.test(argument)) {
        programFromOption = true;
        continue;
      }
      if (argument.startsWith("-")) continue;
      positional.push(argument);
    }
    if (inPlace) paths.push(...(programFromOption ? positional : positional.slice(1)));
  }
  return paths;
}

function copyInstallTargets(command: unknown): string[] {
  const paths: string[] = [];
  for (const invocation of shellCommandInvocations(String(command ?? ""))) {
    if (invocation.executable !== "cp" && invocation.executable !== "install") continue;
    const operands: string[] = [];
    let targetDirectory: string | null = null;
    for (let cursor = 0; cursor < invocation.args.length; cursor += 1) {
      const argument = invocation.args[cursor] ?? "";
      if (argument === "--") {
        operands.push(...invocation.args.slice(cursor + 1).filter(Boolean));
        break;
      }
      if (argument === "-t" || argument === "--target-directory") {
        targetDirectory = invocation.args[cursor + 1] ?? null;
        cursor += 1;
        continue;
      }
      if (argument.startsWith("--target-directory=")) {
        targetDirectory = argument.slice("--target-directory=".length) || null;
        continue;
      }
      if (/^-t.+/u.test(argument)) {
        targetDirectory = argument.slice(2) || null;
        continue;
      }
      if (argument.startsWith("-")) continue;
      operands.push(argument);
    }
    if (targetDirectory) {
      paths.push(targetDirectory, ...operands.map((source) => join(targetDirectory, basename(source))));
      continue;
    }
    if (operands.length < 2) continue;
    const destination = operands.at(-1) ?? "";
    paths.push(destination, ...operands.slice(0, -1).map((source) => join(destination, basename(source))));
  }
  return paths;
}

function shellPaths(input: HookToolInput): string[] {
  const command = String(input.command ?? input.cmd ?? "");
  const paths: string[] = [];
  const push = (raw: unknown) => {
    const value = String(raw ?? "").trim().replace(/^['"]|['"]$/gu, "");
    if (value && !value.startsWith("-")) paths.push(value);
  };
  for (const match of command.matchAll(/(?:^|[^0-9>])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btee\b(?:\s+-[A-Za-z]+)*\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\btouch\b(?:\s+--)?\s+("[^"]+"|'[^']+'|[^\s;&|]+)/gu)) push(match[1]);
  for (const match of command.matchAll(/\bwriteFile(?:Sync)?\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const match of command.matchAll(/\bopen\s*\(\s*["']([^"']+)["']\s*,\s*(?:mode\s*=\s*)?["']([^"']+)["']/gu)) {
    if (/[wax+]/iu.test(match[2] ?? "")) push(match[1]);
  }
  for (const operands of invocations(command, new Set(["rm", "unlink"]))) {
    for (const path of operands) push(path);
  }
  for (const operands of invocations(command, new Set(["mv"]))) {
    for (const path of operands) push(path);
  }
  for (const path of copyInstallTargets(command)) push(path);
  for (const path of sedInPlacePaths(command)) push(path);
  return paths;
}

function gitSubcommand(args: readonly string[]): { command: string; args: string[] } {
  let cursor = 0;
  while (cursor < args.length) {
    const token = args[cursor] ?? "";
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) {
      cursor += 2;
      continue;
    }
    if (/^--(?:git-dir|work-tree|namespace|config-env)=/u.test(token)) {
      cursor += 1;
      continue;
    }
    break;
  }
  return { command: args[cursor] ?? "", args: args.slice(cursor + 1) };
}

export function opaqueShellMutation(event: HookEvent): string | null {
  const command = shellCommandOf(event);
  if (!command) return null;
  for (const invocation of shellCommandInvocations(command)) {
    if (invocation.executable === "git") {
      const git = gitSubcommand(invocation.args);
      if (git.command === "apply" && !git.args.some((argument) => ["--check", "--stat", "--numstat", "--summary"].includes(argument))) {
        return "git apply can mutate implementation paths that are not visible in the hook event";
      }
    }
    if (invocation.executable === "patch" && !invocation.args.includes("--dry-run")) {
      return "patch can mutate implementation paths that are not visible in the hook event";
    }
  }
  return null;
}

function resolvedEquals(cwd: string, rawPath: unknown, absolutePath: string): boolean {
  return resolve(cwd, stripQuotes(rawPath)) === resolve(absolutePath);
}

export function extractTargets(event: HookEvent): string[] {
  const name = toolNameOf(event);
  const input = toolInputOf(event);
  const raw = isFileMutationTool(name) ? [...nestedPaths(input), ...patchPaths(input)] : isShellTool(name) ? shellPaths(input) : [];
  const cwd = cwdOf(event);
  return [...new Set(raw.map(stripQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

export function targetOperation(event: HookEvent, absolutePath: string): "delete" | "write" {
  const cwd = cwdOf(event);
  const input = toolInputOf(event);
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+Delete File:\s+(.+)$/u);
    if (file?.[1] && resolvedEquals(cwd, file[1], absolutePath)) return "delete";
  }
  const command = shellCommandOf(event);
  if (command) {
    for (const operands of invocations(command, new Set(["rm", "unlink"]))) {
      if (operands.some((path) => resolvedEquals(cwd, path, absolutePath))) return "delete";
    }
    for (const operands of invocations(command, new Set(["mv"]))) {
      const sources = operands.length > 1 ? operands.slice(0, -1) : operands;
      if (sources.some((path) => resolvedEquals(cwd, path, absolutePath))) return "delete";
    }
  }
  return "write";
}

export function proposedContent(event: HookEvent, target: string, currentText = ""): string {
  const input = toolInputOf(event);
  const paths = nestedPaths(input).map((path) => resolve(cwdOf(event), path));
  if (paths.includes(resolve(target)) && typeof input.content === "string") return input.content;
  if (paths.includes(resolve(target)) && typeof input.new_string === "string" && typeof input.old_string === "string" && currentText.includes(input.old_string)) {
    return currentText.replace(input.old_string, input.new_string);
  }
  return contentFromPatch(input, target, cwdOf(event), currentText);
}

export function relativePath(root: string, path: string): string {
  return relative(root, resolve(path)).replaceAll("\\", "/") || ".";
}
