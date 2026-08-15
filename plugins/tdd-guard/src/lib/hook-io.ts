import { isAbsolute, relative, resolve } from "node:path";

import {
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolUseId,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import { canonicalToolName, extractShellCommand, isFileMutationTool, isShellTool } from "@harness/core/hook-targets";

export { readStdinJson, preToolDeny, writeJson };

export function cwdOf(event) {
  const raw = event?.cwd ?? event?.working_directory ?? event?.workingDirectory;
  if (raw !== undefined && raw !== null && typeof raw !== "string") return resolve(raw);
  return resolve(eventCwd(event));
}
export function sessionIdOf(event) { return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || "unknown"; }
export function toolUseIdOf(event) { return eventToolUseId(event) || String(event?.id ?? "pending"); }
export function toolNameOf(event) { return canonicalToolName(eventToolName(event)); }
export function toolInputOf(event) { return eventToolInput(event); }
export function shellCommandOf(event) { return extractShellCommand(event); }

function responseOf(event) {
  return event?.tool_response ?? event?.toolResponse ?? event?.tool_result ?? event?.toolResult ?? event?.response ?? event?.error ?? null;
}

function responseText(response) {
  if (typeof response === "string") return response;
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"]
      .map((key) => response[key])
      .filter((value) => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  return "";
}

export function inferOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = responseOf(event);
  if (response && typeof response === "object") {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.returnCode ?? response.return_code ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text = responseText(response);
  const exitLine = text.match(/(?:Process exited with code|Exit code:?|exited with code|exit_code)\s*:?\s*(-?\d+)/iu);
  if (exitLine) return Number(exitLine[1]) === 0 ? "success" : "failure";
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed && Number(failed[1]) > 0) return "failure";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed && Number(passed[1]) > 0 && (!failed || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|\b[1-9][0-9]*\s+failures?\b/iu.test(text)) return "failure";
  if (/\b0\s+failures?\b/iu.test(text)) return "success";
  return "unknown";
}

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1);
  return text;
}

function nestedPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "output_file", "notebook_path"]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...nestedPaths(edit));
  return paths;
}

function patchPaths(input) {
  const text = patchText(input);
  const paths = [];
  for (const line of text.split("\n")) {
    const file = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/u);
    if (file) paths.push(stripQuotes(file[1]));
    const move = line.match(/^\*\*\*\s+Move to:\s+(.+)$/u);
    if (move) paths.push(stripQuotes(move[1]));
  }
  return paths;
}

function patchText(input) {
  return typeof input === "string" ? input : [input?.patch, input?.input, input?.command].filter((value) => typeof value === "string").join("\n");
}

function contentFromPatch(input, target, cwd, currentText) {
  const targetPath = resolve(target);
  let active = false;
  let targetMode = "";
  const added = [];
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+(Add|Update|Delete) File:\s+(.+)$/u);
    if (file) {
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

function tokenize(command) {
  const tokens = [];
  for (const match of String(command ?? "").matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function invocations(command, names) {
  const found = [];
  for (const segment of String(command ?? "").split(/\s*(?:&&|\|\||;|\n)\s*/u)) {
    const tokens = tokenize(segment);
    let index = 0;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[index])) index += 1;
    if (index >= tokens.length) continue;
    const base = String(tokens[index]).replace(/^.*\//u, "");
    if (!names.has(base)) continue;
    index += 1;
    const operands = [];
    while (index < tokens.length && tokens[index].startsWith("-")) {
      if (tokens[index] === "--") {
        index += 1;
        break;
      }
      index += 1;
    }
    while (index < tokens.length) {
      if (!tokens[index].startsWith("-")) operands.push(tokens[index]);
      index += 1;
    }
    found.push(operands);
  }
  return found;
}

function shellPaths(input) {
  const command = String(input?.command ?? input?.cmd ?? "");
  const paths = [];
  const push = (raw) => {
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

function resolvedEquals(cwd, rawPath, absolutePath) {
  return resolve(cwd, stripQuotes(rawPath)) === resolve(absolutePath);
}

export function extractTargets(event) {
  const name = toolNameOf(event);
  const input = toolInputOf(event);
  const raw = isFileMutationTool(name) ? [...nestedPaths(input), ...patchPaths(input)] : isShellTool(name) ? shellPaths(input) : [];
  const cwd = cwdOf(event);
  return [...new Set(raw.map(stripQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
}

export function targetOperation(event, absolutePath) {
  const cwd = cwdOf(event);
  const input = toolInputOf(event);
  for (const line of patchText(input).split("\n")) {
    const file = line.match(/^\*\*\*\s+Delete File:\s+(.+)$/u);
    if (file && resolvedEquals(cwd, file[1], absolutePath)) return "delete";
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

export function proposedContent(event, target, currentText = "") {
  const input = toolInputOf(event);
  const paths = nestedPaths(input).map((path) => resolve(cwdOf(event), path));
  if (paths.includes(resolve(target)) && typeof input.content === "string") return input.content;
  if (paths.includes(resolve(target)) && typeof input.new_string === "string" && typeof input.old_string === "string" && currentText.includes(input.old_string)) {
    return currentText.replace(input.old_string, input.new_string);
  }
  return contentFromPatch(input, target, cwdOf(event), currentText);
}

export function relativePath(root, path) { return relative(root, resolve(path)).replaceAll("\\", "/") || "."; }
export function contextOutput(eventName, text) { return additionalContext(eventName, text); }
export function stopDeny(reason) { return stopBlock(reason); }
