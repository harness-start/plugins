import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);
const TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
const WRITERS = new Set(["project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs"]);
const READ_ONLY = new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);

export function parseShellWords(command) {
  const words = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of String(command ?? "")) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (char === quote) { quote = null; continue; }
      if (quote === '"' && (char === "$" || char === "`")) return null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/u.test(char)) {
      if (current) { words.push(current); current = ""; }
      continue;
    }
    if (/[;&|><`$(){}\n\r]/u.test(char)) return null;
    current += char;
  }
  if (escaped || quote) return null;
  if (current) words.push(current);
  return words;
}

function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3) return null;
  if (!["node", basename(process.execPath), process.execPath].includes(words[0])) return null;
  if (words[1].startsWith("-")) return null;
  const script = isAbsolute(words[1]) ? resolve(words[1]) : resolve(cwd, words[1]);
  const name = basename(script);
  if (dirname(resolve(script)) !== resolve(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(words[2]) ? resolve(words[2]) : resolve(cwd, words[2]);
  const expectedParent = resolve(workspaceRoot, "artifacts", "video");
  if (dirname(projectRoot) !== expectedParent || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}

function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (!value) continue;
    expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve(value)}/dist/cli/`);
  }
  return expanded;
}

function readOnlyCommand(words) {
  if (!words || words.length === 0) return false;
  const command = basename(words[0]);
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}

export function commandTouchesVideoScope(command, cwd, workspaceRoot) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/video/`) || /(?:^|[\s"'=])\.?\/?artifacts\/video(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/video/`);
}

export function evaluateVideoShell({ command, cwd, workspaceRoot }) {
  if (!commandTouchesVideoScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return {
    decision: "allow",
    writer: `video-${invocation.name.slice("project-".length, -".mjs".length)}`,
    projectRoot: invocation.projectRoot,
    argv: invocation.argv,
  };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "video scope permits only read-only commands or an exact registered writer invocation" };
}
