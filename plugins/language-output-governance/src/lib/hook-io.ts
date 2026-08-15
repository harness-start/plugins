import {
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  isStopHookActive,
  readStdinJson,
} from "@harness/core/hook-event";
import { additionalContext, stopBlock, writeJson } from "@harness/core/hook-output";
import { canonicalToolName, extractFileTargets as extractCoreFileTargets } from "@harness/core/hook-targets";

export { readStdinJson, writeJson, isStopHookActive, stopBlock };

export function extractSessionId(event) {
  const value = eventSessionId(event);
  return value || null;
}

export function extractCwd(event) {
  return eventCwd(event);
}

export function extractSource(event) {
  return typeof event?.source === "string" ? event.source : "startup";
}

export function extractPrompt(event) {
  return eventPrompt(event);
}

export function extractAssistantMessage(event) {
  return eventAssistantMessage(event);
}

export function extractToolName(event) {
  return eventToolName(event);
}

export function extractToolInput(event) {
  return eventToolInput(event);
}

function patchAddedText(command) {
  return String(command ?? "")
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

function quotedShellText(command) {
  const values = [];
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"/gu;
  for (const match of String(command ?? "").matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? "";
    if (value) values.push(value);
  }
  return values.join("\n");
}

export function generatedToolText(event) {
  const input = extractToolInput(event);
  const tool = canonicalToolName(extractToolName(event));
  if (tool === "bash" || tool === "execcommand" || tool === "shellcommand") {
    const command = typeof input.command === "string"
      ? input.command
      : typeof input.cmd === "string" ? input.cmd : "";
    const quoted = quotedShellText(command);
    return quoted ? `${command}\n${quoted}` : command;
  }
  if (tool === "write") return typeof input.content === "string" ? input.content : "";
  if (tool === "edit") {
    return typeof (input.new_string ?? input.newString) === "string"
      ? input.new_string ?? input.newString
      : "";
  }
  if (tool === "multiedit") {
    return Array.isArray(input.edits)
      ? input.edits.map((edit) => edit?.new_string ?? edit?.newString ?? "").filter(Boolean).join("\n")
      : "";
  }
  if (tool === "applypatch") {
    return [input.command, input.input, input.patch]
      .filter((value) => typeof value === "string")
      .map(patchAddedText)
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function extractFileTargets(event) {
  return extractCoreFileTargets(event, { tools: "any" });
}

export function additionalContextOutput(hookEventName, text) {
  return additionalContext(hookEventName, text);
}

export function supportsPostToolFeedback() {
  return !(process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL);
}

export function postToolFeedbackOutput(text) {
  return additionalContextOutput("PostToolUse", text);
}

export function warn(message) {
  process.stderr.write(`[language-output-governance] ${message}\n`);
}
