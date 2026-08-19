import { isAbsolute, relative, resolve } from "node:path";

import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  eventToolUseId,
  isRecord,
  readStdinJson,
  type HookEvent,
  type HookToolInput,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { canonicalToolName, extractShellCommand, isFileMutationTool, isShellTool } from "@harness/core/hook-targets";

export type CommandOutcome = "success" | "failure" | "unknown";

export { readStdinJson, preToolDeny, writeJson };

export function cwdOf(event: HookEvent): string {
  const raw = event.cwd ?? event.working_directory ?? event.workingDirectory;
  if (raw !== undefined && raw !== null && typeof raw !== "string") return resolve(raw as string);
  return resolve(eventCwd(event));
}
export function sessionIdOf(event: HookEvent): string {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown";
}
export function toolUseIdOf(event: HookEvent): string {
  return eventToolUseId(event) || String(event.id ?? "pending");
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

function responseOf(event: HookEvent): unknown {
  return eventToolResponse(event) ?? event.error ?? null;
}

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  if (isRecord(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"]
      .map((key) => response[key])
      .filter((value): value is string => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  return "";
}

export function inferOutcome(event: HookEvent, forceFailure = false): CommandOutcome {
  const response = responseOf(event);
  const text = responseText(response);
  const transportFailure = isRecord(response) && (
    response.is_error === true ||
    response.isError === true ||
    Boolean(response.error) ||
    response.interrupted === true
  );
  if (/(?:command not found|permission denied|could not find executable|is not recognized as an internal or external command)/iu.test(text)) {
    return "unknown";
  }
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (
    (failed?.[1] && Number(failed[1]) > 0) ||
    /(?:^|\n)(?:not ok\s+[0-9]+\b|--- FAIL:)|\b[1-9][0-9]*\s+failures?\b|\b[1-9][0-9]*\s+failed\b|FAILED\s*\([^\n]*(?:failures?|errors?)\s*=\s*[1-9]/iu.test(text)
  ) return "failure";
  if (transportFailure) return "unknown";
  const exitLine = text.match(/(?:Process exited with code|Exit code:?|exited with code|exit_code)\s*:?\s*(-?\d+)/iu);
  const responseCode = isRecord(response)
    ? response.exit_code ?? response.exitCode ?? response.returnCode ?? response.return_code ?? response.code
    : undefined;
  const code = Number.isFinite(Number(responseCode))
    ? Number(responseCode)
    : exitLine?.[1] !== undefined ? Number(exitLine[1]) : null;
  if (code !== null && code !== 0) return "unknown";
  if (forceFailure) return "unknown";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed?.[1] && Number(passed[1]) > 0 && (!failed?.[1] || Number(failed[1]) === 0)) return "success";
  if (/\b[1-9][0-9]*\s+passed\b/iu.test(text)) return "success";
  if (/(?:^|\n)Ran\s+[1-9][0-9]*\s+tests?[^\n]*\n(?:\n)?OK(?:\s|$)/iu.test(text)) return "success";
  if (/\b0\s+failures?\b/iu.test(text)) return "success";
  if (isRecord(response) && response.success === false) return "unknown";
  if (code === 0 || (isRecord(response) && response.success === true)) return "success";
  return "unknown";
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

function tokenize(command: unknown): string[] {
  const tokens: string[] = [];
  for (const match of String(command ?? "").matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function invocations(command: unknown, names: Set<string>): string[][] {
  const found: string[][] = [];
  for (const segment of String(command ?? "").split(/\s*(?:&&|\|\||;|\n)\s*/u)) {
    const tokens = tokenize(segment);
    let index = 0;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index] ?? "")) index += 1;
    if (index >= tokens.length) continue;
    const base = String(tokens[index]).replace(/^.*\//u, "");
    if (!names.has(base)) continue;
    index += 1;
    const operands: string[] = [];
    while (index < tokens.length && (tokens[index] ?? "").startsWith("-")) {
      if (tokens[index] === "--") {
        index += 1;
        break;
      }
      index += 1;
    }
    while (index < tokens.length) {
      const token = tokens[index];
      if (token && !token.startsWith("-")) operands.push(token);
      index += 1;
    }
    found.push(operands);
  }
  return found;
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
  for (const match of command.matchAll(/\b(?:writeFile(?:Sync)?|open)\s*\(\s*["']([^"']+)["']/gu)) push(match[1]);
  for (const operands of invocations(command, new Set(["rm", "unlink"]))) {
    for (const path of operands) push(path);
  }
  for (const operands of invocations(command, new Set(["mv"]))) {
    for (const path of operands) push(path);
  }
  return paths;
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
export function contextOutput(eventName: Parameters<typeof additionalContext>[0], text: string) {
  return additionalContext(eventName, text);
}
export function stopDeny(reason: string) {
  return stopBlock(reason);
}
