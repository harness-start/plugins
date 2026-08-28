import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isGenericMutationCommand } from "@harness/core/path-protect";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY, process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..");
const TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
const WRITERS = new Set(["project-init.mjs", "project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs"]);
const PROFILES = new Set(["regional-culture", "mondo", "editorial", "academic", "custom"]);
const READ_ONLY = new Set(["find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);

export type PosterShellDecision = { decision: "allow"; writer?: string; projectRoot?: string; argv?: string[] } | { decision: "deny"; code: string; message: string };

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
  const [runtime, entry, rootWord] = words;
  if (!runtime || !entry || !rootWord || !["node", basename(process.execPath), process.execPath].includes(runtime) || entry.startsWith("-")) return null;
  const script = isAbsolute(entry) ? resolve(entry) : resolve(cwd, entry);
  const name = basename(script);
  if (dirname(script) !== TOOL_DIRECTORY || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(rootWord) ? resolve(rootWord) : resolve(cwd, rootWord);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "poster") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  if (name === "project-init.mjs" && (words.length !== 5 || words[3] !== "--profile" || !PROFILES.has(words[4] ?? ""))) return null;
  if (name === "project-review.mjs" && words.length !== 4) return null;
  if (!["project-init.mjs", "project-review.mjs"].includes(name) && words.length !== 3) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}

function readOnlyCommand(words: string[] | null) {
  if (!words?.length) return false;
  const command = basename(words[0] ?? "");
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "") || words.some((word) => word === "--output" || word.startsWith("--output=")))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(word))) return false;
  if (command === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}

export function commandTouchesPosterScope(command: unknown, cwd: string, workspaceRoot: string) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/poster/`) || /(?:^|[\s"'=])\.?\/?artifacts\/poster(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/poster/`);
}

export function evaluatePosterShell({ command, cwd, workspaceRoot, activeProjectCount = 0 }: { command: unknown; cwd: string; workspaceRoot: string; activeProjectCount?: number }): PosterShellDecision {
  if (!commandTouchesPosterScope(command, cwd, workspaceRoot) && !(activeProjectCount > 0 && isGenericMutationCommand(String(command ?? "")))) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: `poster-${invocation.name.slice("project-".length, -".mjs".length)}`, projectRoot: invocation.projectRoot, argv: invocation.argv };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "poster scope permits only read-only commands or an exact registered writer invocation" };
}
