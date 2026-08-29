import {
  eventAssistantMessage,
  eventCwd,
  eventPrompt,
  eventSessionId,
  eventToolInput,
  eventToolName,
  isRecord,
  isStopHookActive,
  readStdinJson,
  type HookEvent,
} from "@harness/core/hook-event";
import { additionalContext, stopBlock, writeJson, type HookEventName } from "@harness/core/hook-output";
import { canonicalToolName, extractFileTargets as extractCoreFileTargets } from "@harness/core/hook-targets";

export { readStdinJson, writeJson, isStopHookActive, stopBlock };
export {
  eventAssistantMessage as extractAssistantMessage,
  eventCwd as extractCwd,
  eventPrompt as extractPrompt,
  eventToolInput as extractToolInput,
  eventToolName as extractToolName,
};

export function extractSessionId(event: HookEvent): string | null {
  const value = eventSessionId(event);
  return value || null;
}

export function extractSource(event: HookEvent): string {
  return typeof event.source === "string" ? event.source : "startup";
}

function patchAddedText(command: unknown): string {
  return String(command ?? "")
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

function quotedShellText(command: unknown): string {
  const values: string[] = [];
  const pattern = /'([^']*)'|"((?:\\.|[^"\\])*)"/gu;
  for (const match of String(command ?? "").matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? "";
    if (value) values.push(value);
  }
  return values.join("\n");
}

export function generatedToolText(event: HookEvent): string {
  const input = eventToolInput(event);
  const tool = canonicalToolName(eventToolName(event));
  if (tool === "bash" || tool === "execcommand" || tool === "shellcommand") {
    const command = typeof input.command === "string"
      ? input.command
      : typeof input.cmd === "string" ? input.cmd : "";
    const quoted = quotedShellText(command);
    return quoted ? `${command}\n${quoted}` : command;
  }
  if (tool === "write") return typeof input.content === "string" ? input.content : "";
  if (tool === "edit") {
    const next = input.new_string ?? input.newString;
    return typeof next === "string" ? next : "";
  }
  if (tool === "multiedit") {
    return Array.isArray(input.edits)
      ? input.edits.map((edit) => {
        if (!isRecord(edit)) return "";
        const next = edit.new_string ?? edit.newString;
        return typeof next === "string" ? next : "";
      }).filter(Boolean).join("\n")
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

export function extractFileTargets(event: HookEvent): string[] {
  return extractCoreFileTargets(event, { tools: "any" });
}

export function additionalContextOutput(hookEventName: HookEventName, text: string) {
  return additionalContext(hookEventName, text);
}

export function supportsPostToolFeedback(): boolean {
  return true;
}

export function postToolFeedbackOutput(text: string) {
  return additionalContextOutput("PostToolUse", text);
}

export function warn(message: string): void {
  process.stderr.write(`[language-output] ${message}\n`);
}
