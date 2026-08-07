export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true };
  }
}

export function extractSessionId(event) {
  const value = event?.session_id ?? event?.sessionId;
  return typeof value === "string" && value ? value : null;
}

export function extractCwd(event) {
  return event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd();
}

export function extractSource(event) {
  return typeof event?.source === "string" ? event.source : "startup";
}

export function extractPrompt(event) {
  return typeof event?.prompt === "string" ? event.prompt : "";
}

export function extractAssistantMessage(event) {
  const message = event?.last_assistant_message ?? event?.lastAssistantMessage ?? "";
  return typeof message === "string" ? message : "";
}

export function isStopHookActive(event) {
  return event?.stop_hook_active === true || event?.stopHookActive === true;
}

export function extractToolName(event) {
  return event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "";
}

export function extractToolInput(event) {
  return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {};
}

function canonicalToolName(value) {
  return String(value ?? "").replaceAll("_", "").toLowerCase();
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
  if (tool === "edit") return typeof (input.new_string ?? input.newString) === "string"
    ? input.new_string ?? input.newString
    : "";
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
  const input = extractToolInput(event);
  const values = [input.file_path, input.filePath, input.path]
    .filter((value) => typeof value === "string" && value);
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) {
      const value = edit?.file_path ?? edit?.filePath;
      if (typeof value === "string" && value) values.push(value);
    }
  }
  return [...new Set(values)];
}

export function writeJson(value) {
  if (value === null) return;
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function additionalContextOutput(hookEventName, text) {
  return { hookSpecificOutput: { hookEventName, additionalContext: text } };
}

export function supportsPostToolFeedback() {
  return !(process.env.PLUGIN_ROOT && process.env.DEEPSEEK_MODEL);
}

export function postToolFeedbackOutput(text) {
  return additionalContextOutput("PostToolUse", text);
}

export function stopBlock(reason) {
  return { decision: "block", reason };
}

export function warn(message) {
  process.stderr.write(`[language-output-governance] ${message}\n`);
}
