import { isAbsolute, resolve } from "node:path";

import {
  eventCwd,
  eventToolInput,
  eventToolName,
  type HookEvent,
} from "./hook-event.ts";

export type ExtractTargetOptions = {
  tools?: "mutation" | "read-or-mutation" | "any";
  includeShellWrites?: boolean;
};

const FILE_MUTATION_TOOLS = new Set([
  "applypatch",
  "createfile",
  "edit",
  "multiedit",
  "notebookedit",
  "searchreplace",
  "write",
]);
const READ_TOOLS = new Set(["read"]);
const SHELL_TOOLS = new Set([
  "bash",
  "exec",
  "execcommand",
  "localshell",
  "shell",
  "shellcommand",
]);
const PATH_KEYS = [
  "file_path",
  "filePath",
  "path",
  "target_file",
  "output_file",
  "outputFile",
  "notebook_path",
  "notebookPath",
] as const;

export function canonicalToolName(name: string): string {
  return String(name ?? "").replaceAll("_", "").toLowerCase();
}

export function isFileMutationTool(name: string): boolean {
  return FILE_MUTATION_TOOLS.has(canonicalToolName(name));
}

export function isReadTool(name: string): boolean {
  return READ_TOOLS.has(canonicalToolName(name));
}

export function isShellTool(name: string): boolean {
  return SHELL_TOOLS.has(canonicalToolName(name));
}

export function extractShellCommand(event: HookEvent): string | null {
  if (!isShellTool(eventToolName(event))) return null;
  const input = eventToolInput(event);
  const command = input.command ?? input.cmd ?? input.script;
  return typeof command === "string" ? command : null;
}

function stripMatchingQuotes(value: string): string {
  const text = String(value ?? "").trim();
  if (
    text.length >= 2
    && ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function objectPaths(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const paths: string[] = [];
  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(record.edits)) {
    for (const edit of record.edits) paths.push(...objectPaths(edit));
  }
  return paths;
}

export function extractPatchPaths(payload: string): string[] {
  return patchPaths(payload);
}

function patchPaths(payload: string): string[] {
  const paths: string[] = [];
  for (const line of payload.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (file?.[1]) paths.push(stripMatchingQuotes(file[1]));
    if (move?.[1]) paths.push(stripMatchingQuotes(move[1]));
  }
  return paths;
}

function patchPayload(input: Record<string, unknown> | string): string {
  if (typeof input === "string") return input;
  return [input.patch, input.input, input.command]
    .filter((value) => typeof value === "string")
    .join("\n");
}

function resolveTargets(raw: string[], cwd: string): string[] {
  return [...new Set(
    raw
      .map(stripMatchingQuotes)
      .filter(Boolean)
      .map((path) => (isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, "")))),
  )];
}

function shellWritePaths(command: string): string[] {
  const paths: string[] = [];
  const push = (raw: string | undefined) => {
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

function acceptsTool(name: string, tools: NonNullable<ExtractTargetOptions["tools"]>): boolean {
  if (tools === "any") return true;
  if (isFileMutationTool(name)) return true;
  if (tools === "read-or-mutation" && isReadTool(name)) return true;
  return false;
}

export function extractFileTargets(event: HookEvent, options: ExtractTargetOptions = {}): string[] {
  const tools = options.tools ?? "mutation";
  const name = eventToolName(event);
  const cwd = resolve(eventCwd(event));
  const input = eventToolInput(event);
  const raw: string[] = [];

  if (acceptsTool(name, tools)) {
    raw.push(...objectPaths(input));
    raw.push(...patchPaths(patchPayload(typeof event.tool_input === "string" ? event.tool_input : input)));
    if (typeof event.tool_input === "string") raw.push(...objectPaths(input));
  }

  if (options.includeShellWrites) {
    const command = extractShellCommand(event)
      ?? (typeof input.command === "string" ? input.command : null)
      ?? (typeof input.cmd === "string" ? input.cmd : null)
      ?? (typeof input.script === "string" ? input.script : null);
    if (command) raw.push(...shellWritePaths(command));
  }

  return resolveTargets(raw, cwd);
}