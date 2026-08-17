import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY, process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..");
const TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
const WRITERS = new Set(["project-init.mjs", "project-lint.mjs", "project-render.mjs", "project-review.mjs", "project-release.mjs"]);
const READ_ONLY = new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);

export type TrainingShellDecision = { decision: "allow"; writer?: string; projectRoot?: string; argv?: string[] } | { decision: "deny"; code: string; message: string };

export function parseShellWords(command: unknown): string[] | null {
  const words: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  for (const char of String(command ?? "")) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) { quote = null; continue; } if (quote === "\"" && (char === "$" || char === "`")) return null; current += char; continue; }
    if (char === "'" || char === "\"") { quote = char; continue; }
    if (/\s/u.test(char)) { if (current) { words.push(current); current = ""; } continue; }
    if (/[;&|><`$(){}\n\r]/u.test(char)) return null;
    current += char;
  }
  if (escaped || quote) return null;
  if (current) words.push(current);
  return words;
}

function expandKnownPluginRoot(command: unknown) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve(value)}/dist/cli/`);
  }
  return expanded;
}

function wrapperInvocation(words: string[] | null, cwd: string, workspaceRoot: string) {
  if (!words || words.length < 3) return null;
  const [first, second, third] = words;
  if (!first || !second || !third || !["node", basename(process.execPath), process.execPath].includes(first) || second.startsWith("-")) return null;
  const script = isAbsolute(second) ? resolve(second) : resolve(cwd, second);
  const name = basename(script);
  if (dirname(script) !== TOOL_DIRECTORY || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(third) ? resolve(third) : resolve(cwd, third);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "training") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}

function readOnlyCommand(words: string[] | null) {
  if (!words?.length) return false;
  const command = basename(words[0] ?? "");
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}

export function commandTouchesTrainingScope(command: unknown, cwd: string, workspaceRoot: string) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/training/`) || /(?:^|[\s"'=])\.?\/?artifacts\/training(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/training/`);
}

export function evaluateTrainingShell({ command, cwd, workspaceRoot }: { command: unknown; cwd: string; workspaceRoot: string }): TrainingShellDecision {
  if (!commandTouchesTrainingScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: `training-${invocation.name.slice("project-".length, -".mjs".length)}`, projectRoot: invocation.projectRoot, argv: invocation.argv };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "training scope permits only read-only commands or an exact registered writer invocation" };
}
