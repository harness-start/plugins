import { isAbsolute, resolve } from "node:path";

import {
  eventAssistantMessage,
  eventCwd,
  eventSessionId,
  eventToolInput,
  eventToolName,
  eventToolResponse,
  isRecord,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { additionalContext, preToolDeny, stopBlock, writeJson, type HookEventName } from "@harness/core/hook-output";
import {
  extractFileTargets as extractCoreFileTargets,
  extractShellCommand,
  isFileMutationTool,
} from "@harness/core/hook-targets";

export type CommandOutcome = "success" | "failure" | "unknown";

export { readStdinJson, extractShellCommand, preToolDeny, writeJson };
export {
  eventAssistantMessage as extractAssistantMessage,
  eventCwd as extractCwd,
  eventToolInput as extractToolInput,
  eventToolName as extractToolName,
};

export function extractSessionId(event: HookEvent): string | null {
  return eventSessionId(event) || process.env.AI_EXPERTS_SESSION_ID || null;
}

export function extractAgentId(event: HookEvent): unknown {
  return event.agent_id ?? event.agentId ?? "";
}

export function extractAgentPrompt(event: HookEvent): unknown {
  const input = eventToolInput(event);
  return event.agent_prompt ?? event.agentPrompt ?? input.prompt ?? input.message ?? input.task ?? input.description ?? "";
}

export function extractToolResponse(event: HookEvent): unknown {
  return eventToolResponse(event) ?? event.error ?? null;
}

function stripMatchingQuotes(value: unknown): string {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

function objectPaths(input: unknown): string[] {
  if (!isRecord(input)) return [];
  const paths: string[] = [];
  for (const key of ["file_path", "filePath", "path", "target_file", "targetFile", "output_file", "outputFile", "notebook_path", "notebookPath"]) {
    const value = input[key];
    if (typeof value === "string" && value) paths.push(value);
  }
  if (Array.isArray(input.paths)) {
    paths.push(...input.paths.filter((path): path is string => typeof path === "string"));
  }
  if (Array.isArray(input.edits)) for (const edit of input.edits) paths.push(...objectPaths(edit));
  return paths;
}

function responsePaths(response: unknown): string[] {
  const paths: string[] = [];
  if (isRecord(response)) {
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
    if (status?.[1]) paths.push(stripMatchingQuotes(status[1]));
    if (changed?.[1]) paths.push(stripMatchingQuotes(changed[1]));
  }
  return paths;
}

export function extractFileTargets(event: HookEvent): string[] {
  const cwd = resolve(eventCwd(event));
  const core = extractCoreFileTargets(event);
  const extras = responsePaths(extractToolResponse(event)).map((value) => (
    isAbsolute(value) ? resolve(value) : resolve(cwd, stripMatchingQuotes(value).replace(/^\.\//u, ""))
  ));
  return [...new Set([...core, ...extras])];
}

export function isMutationTool(event: HookEvent): boolean {
  return isFileMutationTool(eventToolName(event));
}

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  if (isRecord(response)) {
    const fields = ["stdout", "stderr", "output", "content", "message"]
      .map((key) => response[key])
      .filter((value): value is string => typeof value === "string");
    if (fields.length > 0) return fields.join("\n");
  }
  try { return JSON.stringify(response ?? ""); } catch { return String(response ?? ""); }
}

export function inferOutcome(event: HookEvent, forceFailure = false): CommandOutcome {
  if (forceFailure) return "failure";
  const response = extractToolResponse(event);
  if (isRecord(response)) {
    if (response.is_error === true || response.isError === true || response.error || response.interrupted === true) return "failure";
    const code = response.exit_code ?? response.exitCode ?? response.code;
    if (Number.isFinite(Number(code))) return Number(code) === 0 ? "success" : "failure";
    if (response.success === false) return "failure";
    if (response.success === true) return "success";
  }
  const text = responseText(response);
  const codes = [...text.matchAll(/(?:Process exited with code|Exit code:?|exited with code)\s+(-?[0-9]+)/giu)];
  const lastCode = codes.at(-1)?.[1];
  if (lastCode !== undefined) return Number(lastCode) === 0 ? "success" : "failure";
  const failed = text.match(/(?:^|\n)#\s*fail\s+([0-9]+)/iu);
  if (failed?.[1] && Number(failed[1]) > 0) return "failure";
  const passed = text.match(/(?:^|\n)#\s*pass\s+([0-9]+)/iu);
  if (passed?.[1] && Number(passed[1]) > 0 && (!failed?.[1] || Number(failed[1]) === 0)) return "success";
  if (/(?:^|\n)not ok\s+[0-9]+\b|command failed|is_error["']?\s*:\s*true/iu.test(text)) return "failure";
  if (!process.env.PLUGIN_ROOT && isRecord(response)) return "success";
  return "unknown";
}

export function contextOutput(eventName: HookEventName, text: string) {
  if (process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL && eventName === "PostToolUse") {
    process.stderr.write(`${text}\n`);
    process.exitCode = 2;
    return null;
  }
  return additionalContext(eventName, text);
}

export function stopDeny(reason: string) {
  return stopBlock(reason);
}
