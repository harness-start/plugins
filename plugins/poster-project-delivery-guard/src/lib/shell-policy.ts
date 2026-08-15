import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);
const TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
const WRITERS = new Set(["project-lint.mjs", "project-release.mjs"]);
const READ_ONLY = new Set(["file", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);

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
    if (/\s/u.test(char)) { if (current) { words.push(current); current = ""; } continue; }
    if (/[;&|><`$(){}\n\r]/u.test(char)) return null;
    current += char;
  }
  if (escaped || quote) return null;
  if (current) words.push(current);
  return words;
}

function expandKnownPluginRoot(command) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    if (process.env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve(process.env[name]));
  }
  return expanded;
}

function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3 || !["node", basename(process.execPath), process.execPath].includes(words[0]) || words[1].startsWith("-")) {
    return null;
  }
  const script = isAbsolute(words[1]) ? resolve(words[1]) : resolve(cwd, words[1]);
  const name = basename(script);
  if (dirname(script) !== resolve(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(words[2]) ? resolve(words[2]) : resolve(cwd, words[2]);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "poster") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) {
    return null;
  }
  if (name === "project-release.mjs" && words.length !== 3) return null;
  if (name === "project-lint.mjs" && words.slice(3).some((word) => word.startsWith("-"))) return null;
  return { name, projectRoot };
}

function readOnlyCommand(words) {
  if (!words?.length || words[0] !== basename(words[0]) || !READ_ONLY.has(words[0])) return false;
  if (words[0] === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) {
      return false;
    }
  }
  if (words[0] === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}

function touchesPoster(command, cwd, workspaceRoot) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve(workspaceRoot).replaceAll("\\", "/");
  const current = resolve(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/poster/`)
    || /(?:^|[\s"'=])\.?\/?artifacts\/poster(?:\/|[\s"']|$)/u.test(normalized)
    || normalized.includes(`${root}/artifacts/poster/`);
}

export function evaluatePosterShell({ command, cwd, workspaceRoot }) {
  if (!touchesPoster(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: invocation.name, projectRoot: invocation.projectRoot };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return {
    decision: "deny",
    code: "UNKNOWN_MUTATION_SHELL",
    message: "poster scope permits only read-only commands or an exact registered writer invocation",
  };
}
