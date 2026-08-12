import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIRECTORY = fileURLToPath(new URL("../tools/", import.meta.url));
const WRITERS = new Set(["project-lint.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs", "project-stage.mjs", "project-validate.mjs"]);
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
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) if (process.env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve(process.env[name]));
  return expanded;
}

function wrapperInvocation(words, cwd, workspaceRoot) {
  if (!words || words.length < 3 || !["node", basename(process.execPath), process.execPath].includes(words[0]) || words[1].startsWith("-")) return null;
  const script = isAbsolute(words[1]) ? resolve(words[1]) : resolve(cwd, words[1]);
  const name = basename(script);
  if (dirname(script) !== resolve(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(words[2]) ? resolve(words[2]) : resolve(cwd, words[2]);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "logo") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  if (name === "project-release.mjs" && words.length !== 3) return null;
  if (name === "project-render.mjs" && (words.length !== 4 || !["source", "release"].includes(words[3]))) return null;
  if (name === "project-stage.mjs" && (words.length !== 4 || words[3] !== "release")) return null;
  if (name === "project-validate.mjs") {
    const args = words.slice(3);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--json") continue;
      if (/^--stage=(?:source|release)$/u.test(value)) continue;
      if (value === "--stage" && ["source", "release"].includes(args.shift())) continue;
      return null;
    }
  }
  if (name === "project-preview.mjs") {
    const args = words.slice(3);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--write-review") continue;
      return null;
    }
  }
  return { name, projectRoot };
}

function readOnlyCommand(words) {
  if (!words?.length || words[0] !== basename(words[0]) || !READ_ONLY.has(words[0])) return false;
  const command = words[0];
  if (command === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) return false;
  }
  if (command === "rg" && words.some((word) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}

function touchesLogo(command, cwd, workspaceRoot) {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve(workspaceRoot).replaceAll("\\", "/");
  const current = resolve(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/logo/`) || /(?:^|[\s"'=])\.?\/?artifacts\/logo(?:\/|[\s"']|$)/u.test(normalized) || normalized.includes(`${root}/artifacts/logo/`);
}

export function evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount = 0 }) {
  if (activeProjectCount < 1 && !touchesLogo(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) return { decision: "allow", writer: invocation.name, projectRoot: invocation.projectRoot };
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "logo scope permits only read-only commands or an exact registered writer invocation" };
}
