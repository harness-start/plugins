import { isAbsolute, relative, resolve } from "node:path";

const FILE_TOOLS = new Set(["applypatch", "edit", "multiedit", "notebookedit", "write", "createfile", "searchreplace"]);
const SHELL_TOOLS = new Set(["bash", "exec", "execcommand", "localshell", "shell", "shellcommand"]);

export async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
}

export function cwdOf(event) { return resolve(event?.cwd ?? event?.working_directory ?? event?.workingDirectory ?? process.cwd()); }
export function sessionIdOf(event) { return String(event?.session_id ?? event?.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown"); }
export function toolUseIdOf(event) { return String(event?.tool_use_id ?? event?.toolUseId ?? event?.id ?? "pending"); }
export function toolNameOf(event) { return String(event?.tool_name ?? event?.toolName ?? event?.tool?.name ?? "").replaceAll("_", "").toLowerCase(); }
export function toolInputOf(event) { return event?.tool_input ?? event?.toolInput ?? event?.tool?.input ?? event?.input ?? {}; }

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

function shellPaths(input) {
  const command = String(input?.command ?? input?.cmd ?? "");
  const paths = [];
  for (const match of command.matchAll(/(?:^|[^>])>>?\s*["']?([^\s;&|"']+)/gu)) paths.push(match[1]);
  for (const match of command.matchAll(/\btee\s+(?:-[A-Za-z]+\s+)*["']?([^\s;&|"']+)/gu)) paths.push(match[1]);
  for (const match of command.matchAll(/\btouch\s+(?:--\s+)?["']?([^\s;&|"']+)/gu)) paths.push(match[1]);
  return paths;
}

export function extractTargets(event) {
  const name = toolNameOf(event);
  const input = toolInputOf(event);
  const raw = FILE_TOOLS.has(name) ? [...nestedPaths(input), ...patchPaths(input)] : SHELL_TOOLS.has(name) ? shellPaths(input) : [];
  const cwd = cwdOf(event);
  return [...new Set(raw.map(stripQuotes).filter(Boolean).map((path) => isAbsolute(path) ? resolve(path) : resolve(cwd, path.replace(/^\.\//u, ""))))];
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
export function preToolDeny(reason) { return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }; }
export function contextOutput(eventName, text) { return { hookSpecificOutput: { hookEventName: eventName, additionalContext: text } }; }
export function writeJson(value) { if (value) process.stdout.write(`${JSON.stringify(value)}\n`); }
