import { isAbsolute, resolve } from "node:path";

import {
  eventAssistantMessage,
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand,
  isFileMutationTool,
} from "@harness/core/hook-targets";

export { readStdinJson, extractShellCommand, preToolDeny, writeJson };

export function extractSessionId(event) {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}

export function extractCwd(event) {
  return eventCwd(event);
}

export function extractAgentId(event) {
  return event?.agent_id ?? event?.agentId ?? "";
}

export function extractAgentPrompt(event) {
  const input = extractToolInput(event);
  return event?.agent_prompt ?? event?.agentPrompt ?? input?.prompt ?? input?.message ?? input?.task ?? input?.description ?? "";
}

export function extractToolName(event) {
  return eventToolName(event);
}

export function extractToolInput(event) {
  return eventToolInput(event);
}

export function extractToolResponse(event) {
  return eventToolResponse(event) ?? event?.error ?? null;
}

export function extractAssistantMessage(event) {
  return eventAssistantMessage(event);
}

function stripMatchingQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

function objectPaths(input) {
  if (!input || typeof input !== "object") return [];
  const paths = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "targetFile", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    if (typeof input[key] === "string" && input[key]) paths.push(input[key]);
  }
  if (Array.isArray(input.paths)) paths.push(...input.paths);
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths(edit));
  return paths;
}

function responsePaths(response) {
  const paths = [];
  if (response && typeof response === "object") {
    if (response.changes && typeof response.changes === "object" && !Array.isArray(response.changes)) {
      paths.push(...Object.keys(response.changes));
    }
    paths.push(...objectPaths(response));
    for (const key of ["output", "stdout", "text"]) {
      if (typeof response[key] === "string") paths.push(...responsePaths(response[key]));
    }
    return paths;
  }
  if (typeof response !== "string") return paths;
  for (const line of response.split("\n")) {
    const status = line.match(/^(?:A|M|D|R[0-9]*)\s+(.+)$/u);
    const changed = line.match(/^(?:added|updated|deleted):\s+(.+)$/iu);
    if (status) paths.push(stripMatchingQuotes(status[1]));
    if (changed) paths.push(stripMatchingQuotes(changed[1]));
  }
  return paths;
}

export function extractFileTargets(event) {
  const cwd = resolve(extractCwd(event));
  const core = extractCoreFileTargets(event);
  const extras = responsePaths(extractToolResponse(event)).map((value) => (
    isAbsolute(value) ? resolve(value) : resolve(cwd, stripMatchingQuotes(value).replace(/^\.\//u, ""))
  ));
  return [...new Set([...core, ...extras])];
}

export function isMutationTool(event) {
  return isFileMutationTool(extractToolName(event));
}

function responseText(response) {
  if (typeof response === "string") return response;
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"]
      .map((key) => response[key])
      .filter((value) => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  try { return JSON.stringify(response ?? ""); } catch { return String(response ?? ""); }
}

export function inferOutcome(event, forceFailure = false) {
  if (forceFailure) return "failure";
  const response = extractToolResponse(event);
  if (response && typeof response === "object") {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text = responseText(response);
  const codes = [...text.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?[0-9]+)/giu)];
  if (codes.length > 0) return Number(codes.at(-1)[1]) === 0 ? "success" : "failure";
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed && Number(failed[1]) > 0) return "failure";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed && Number(passed[1]) > 0 && (!failed || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|command failed|is_error["']?\s*:\s*true/iu.test(text)) return "failure";
  if (!process.env.PLUGIN_ROOT && response && typeof response === "object" && !Array.isArray(response)) return "success";
  return "unknown";
}

export function contextOutput(eventName, text) {
  if (process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL && eventName === "PostToolUse") {
    process.stderr.write(`${text}\n`);
    process.exitCode = 2;
    return null;
  }
  return additionalContext(eventName, text);
}

export function stopDeny(reason) {
  return stopBlock(reason);
}
