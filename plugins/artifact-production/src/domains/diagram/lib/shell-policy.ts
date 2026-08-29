import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ENTRY_DIRECTORY = dirname(resolve(process.argv[1] ?? process.cwd()));
const PLUGIN_DIRECTORY = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT
  ? resolve(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? ".")
  : ["dispatcher.mjs", "harness.mjs"].includes(basename(process.argv[1] ?? ""))
    ? resolve(ENTRY_DIRECTORY, "../..")
    : resolve(MODULE_DIRECTORY, "../../../..");
const TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
const WRITERS = new Set(["project-init.mjs", "project-import.mjs", "project-lint.mjs", "project-render.mjs", "project-probe.mjs", "project-review.mjs", "project-release.mjs"]);
const READ_ONLY = new Set(["find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);
export type DiagramShellDecision = { decision: "allow"; writer?: string; projectRoot?: string; argv?: string[] } | { decision: "deny"; code: string; message: string };

export function parseShellWords(command: unknown): string[] | null {
  const words: string[] = []; let current = ""; let quote: string | null = null; let escaped = false;
  for (const char of String(command ?? "")) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) { quote = null; continue; } if (quote === '"' && (char === "$" || char === "`")) return null; current += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/u.test(char)) { if (current) { words.push(current); current = ""; } continue; }
    if (/[;&|><`$(){}\n\r]/u.test(char)) return null; current += char;
  }
  if (escaped || quote) return null; if (current) words.push(current); return words;
}

function expandKnownPluginRoot(command: unknown) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) { const value = process.env[name]; if (value) expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve(value)}/dist/cli/`); }
  return expanded;
}

function invocation(words: string[] | null, cwd: string, workspaceRoot: string) {
  if (!words || words.length < 5) return null; const [runtime, entry, resource, action, rootWord] = words;
  if (!runtime || !entry || resource !== "diagram" || !action || !rootWord || !["node", basename(process.execPath), process.execPath].includes(runtime) || entry.startsWith("-")) return null;
  const script = isAbsolute(entry) ? resolve(entry) : resolve(cwd, entry); const name = `project-${action}.mjs`;
  if (dirname(script) !== TOOL_DIRECTORY || basename(script) !== "harness.mjs" || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(rootWord) ? resolve(rootWord) : resolve(cwd, rootWord);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "diagram") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  const hasExternalInput = name === "project-import.mjs" || name === "project-review.mjs";
  const exact = hasExternalInput ? words.length === 6 && isAbsolute(words[5] ?? "") : words.length === 5;
  if (!exact) return null; return { name, projectRoot, argv: [script, ...words.slice(2)] };
}

function readOnly(words: string[] | null) {
  if (!words?.length) return false; const command = basename(words[0] ?? ""); if (!READ_ONLY.has(command)) return false;
  if (command === "git" && (!['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files'].includes(words[1] ?? "") || words.some((word) => word === "--output" || word.startsWith("--output=")))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(word))) return false;
  return command !== "rg" || !words.some((word) => word === "--pre" || word.startsWith("--pre="));
}

export function commandTouchesDiagramScope(command: unknown, cwd: string, workspaceRoot: string) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/"); const normalizedCwd = resolve(cwd).replaceAll("\\", "/"); const normalizedRoot = resolve(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/diagram/`) || /(?:^|[\s"'=])\.?\/?artifacts\/diagram(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/diagram/`);
}

export function evaluateDiagramShell({ command, cwd, workspaceRoot }: { command: unknown; cwd: string; workspaceRoot: string; activeProjectCount?: number }): DiagramShellDecision {
  if (!commandTouchesDiagramScope(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command)); const registered = invocation(words, cwd, workspaceRoot);
  if (registered) return { decision: "allow", writer: `diagram-${registered.name.slice("project-".length, -".mjs".length)}`, projectRoot: registered.projectRoot, argv: registered.argv };
  if (readOnly(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "diagram scope permits only read-only commands or an exact registered writer invocation" };
}
