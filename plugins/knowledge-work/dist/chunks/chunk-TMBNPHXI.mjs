// harness-source-hash: sha256:79eb582ff70d8199af6be7045d1a61bcfac5a7992385c0dc88fd75a3d05b1601

// core/src/owner-hook-runtime.ts
import { AsyncLocalStorage } from "node:async_hooks";
var invocationStorage = new AsyncLocalStorage();
var OwnerHookExitError = class extends Error {
  status;
  constructor(status) {
    super(`owner hook exited with status ${status}`);
    this.name = "OwnerHookExitError";
    this.status = status;
  }
};
function currentOwnerHookEvent() {
  return invocationStorage.getStore()?.event;
}
function collectOwnerHookOutput(value) {
  const invocation = invocationStorage.getStore();
  if (!invocation) return false;
  if (value !== null && value !== void 0) invocation.outputs.push(value);
  return true;
}
async function invokeOwnerHook(event, args, operation) {
  const outputs = [];
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  process.argv = [originalArgv[0] ?? process.execPath, originalArgv[1] ?? "owner-hook", ...args];
  process.exitCode = void 0;
  try {
    await invocationStorage.run({ args, event, outputs }, operation);
    if (typeof process.exitCode === "number" && process.exitCode !== 0) {
      throw new OwnerHookExitError(process.exitCode);
    }
    return outputs;
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  }
}
function ownerHookHandler(operation) {
  return async ({ args, event }) => {
    try {
      return await invokeOwnerHook(event, args, operation);
    } catch (error) {
      if (error instanceof OwnerHookExitError) {
        process.exitCode = error.status;
        return [];
      }
      throw error;
    }
  };
}

// core/src/hook-event.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}
function nestedRecord(event, key) {
  const value = event[key];
  return isRecord(value) ? value : null;
}
async function readStdinJson(input = process.stdin) {
  if (input === process.stdin) {
    const current = currentOwnerHookEvent();
    if (current) return current;
  }
  let raw = "";
  for await (const chunk of input) raw += chunk.toString();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { __parseError: true };
  } catch {
    return { __parseError: true };
  }
}
function eventSessionId(event) {
  const context = nestedRecord(event, "context");
  return firstString(
    event.session_id,
    event.sessionId,
    event.sessionID,
    event.conversation_id,
    event.conversationId,
    context?.session_id
  );
}
function eventCwd(event) {
  return firstString(event.cwd, event.working_directory, event.workingDirectory) || process.cwd();
}
function eventToolName(event) {
  const tool = nestedRecord(event, "tool");
  return firstString(event.tool_name, event.toolName, tool?.name);
}
function eventToolInput(event) {
  const tool = nestedRecord(event, "tool");
  const value = event.tool_input ?? event.toolInput ?? tool?.input ?? event.input;
  return isRecord(value) ? value : {};
}
function eventToolResponse(event) {
  const tool = nestedRecord(event, "tool");
  return event.tool_response ?? event.toolResponse ?? event.tool_result ?? event.toolResult ?? event.response ?? tool?.response ?? null;
}
function eventPrompt(event) {
  return firstString(event.prompt, event.user_prompt, event.userPrompt, event.message);
}
function eventAssistantMessage(event) {
  return firstString(
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistant_text,
    event.assistantText
  );
}

export {
  collectOwnerHookOutput,
  ownerHookHandler,
  isRecord,
  readStdinJson,
  eventSessionId,
  eventCwd,
  eventToolName,
  eventToolInput,
  eventToolResponse,
  eventPrompt,
  eventAssistantMessage
};
