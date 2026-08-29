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
const WRITERS = new Set(["project-advice.mjs", "project-lint.mjs", "project-lock.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs", "project-review.mjs", "project-stage.mjs", "project-validate.mjs"]);
const MUTATING_WRITERS = new Set(["project-advice.mjs", "project-lock.mjs", "project-preview.mjs", "project-render.mjs", "project-release.mjs", "project-review.mjs", "project-stage.mjs"]);
const READ_ONLY = new Set(["file", "git", "grep", "head", "jq", "ls", "pwd", "rg", "stat", "tail", "wc"]);

export function parseShellWords(command: unknown): string[] | null {
  const words = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
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

function expandKnownPluginRoot(command: unknown): string {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (value) expanded = expanded.replaceAll(`\${${name}}`, resolve(value));
  }
  return expanded;
}

function wrapperInvocation(words: string[] | null, cwd: string, workspaceRoot: string): { name: string; projectRoot: string; argv: string[] } | null {
  const first = words?.[0];
  const second = words?.[1];
  const resource = words?.[2];
  const action = words?.[3];
  const rootWord = words?.[4];
  if (!words || words.length < 5 || first === undefined || second === undefined || resource !== "logo" || action === undefined || rootWord === undefined || !["node", basename(process.execPath), process.execPath].includes(first) || second.startsWith("-")) return null;
  const script = isAbsolute(second) ? resolve(second) : resolve(cwd, second);
  const name = `project-${action}.mjs`;
  if (dirname(script) !== resolve(TOOL_DIRECTORY) || basename(script) !== "harness.mjs" || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(rootWord) ? resolve(rootWord) : resolve(cwd, rootWord);
  if (dirname(projectRoot) !== resolve(workspaceRoot, "artifacts", "logo") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  if (name === "project-release.mjs" && words.length !== 5) return null;
  if (name === "project-lock.mjs" && words.length !== 5) return null;
  if (["project-advice.mjs", "project-review.mjs"].includes(name) && words.length !== 6) return null;
  if (name === "project-render.mjs" && (words.length !== 6 || !["source", "release"].includes(words[5] ?? ""))) return null;
  if (name === "project-stage.mjs" && (words.length !== 6 || words[5] !== "release")) return null;
  if (name === "project-validate.mjs") {
    const args = words.slice(5);
    while (args.length > 0) {
      const value = args.shift();
      if (value === "--json") continue;
      if (value !== undefined && /^--stage=(?:source|release)$/u.test(value)) continue;
      if (value === "--stage" && ["source", "release"].includes(args.shift() ?? "")) continue;
      return null;
    }
  }
  if (name === "project-preview.mjs") {
    if (words.length !== 5) return null;
  }
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}

function readOnlyCommand(words: string[] | null): boolean {
  const command = words?.[0];
  if (!words?.length || command === undefined || command !== basename(command) || !READ_ONLY.has(command)) return false;
  if (command === "git") {
    if (!["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
    if (words.some((word: string) => word === "--output" || word.startsWith("--output=") || /^-o.+/u.test(word) || ["--ext-diff", "--textconv"].includes(word))) return false;
  }
  if (command === "rg" && words.some((word: string) => word === "--pre" || word.startsWith("--pre="))) return false;
  return true;
}

function touchesLogo(command: unknown, cwd: string, workspaceRoot: string): boolean {
  const normalized = String(command ?? "").replaceAll("\\", "/");
  const root = resolve(workspaceRoot).replaceAll("\\", "/");
  const current = resolve(cwd).replaceAll("\\", "/");
  return current.startsWith(`${root}/artifacts/logo/`) || /(?:^|[\s"'=])\.?\/?artifacts\/logo(?:\/|[\s"']|$)/u.test(normalized) || normalized.includes(`${root}/artifacts/logo/`);
}

export type LogoShellDecision = {
  decision: "allow" | "deny";
  writer?: string;
  projectRoot?: string;
  argv?: string[];
  code?: string;
  message?: string;
};

export function evaluateLogoShell({
  command,
  cwd,
  workspaceRoot,
}: {
  command: unknown;
  cwd: string;
  workspaceRoot: string;
  activeProjectCount?: number;
}): LogoShellDecision {
  if (!touchesLogo(command, cwd, workspaceRoot)) return { decision: "allow" };
  const words = parseShellWords(expandKnownPluginRoot(command));
  const invocation = wrapperInvocation(words, cwd, workspaceRoot);
  if (invocation) {
    const writer = MUTATING_WRITERS.has(invocation.name)
      ? `logo-${invocation.name.slice("project-".length, -".mjs".length)}`
      : undefined;
    return { decision: "allow", ...(writer ? { writer } : {}), projectRoot: invocation.projectRoot, argv: invocation.argv };
  }
  if (readOnlyCommand(words)) return { decision: "allow" };
  return { decision: "deny", code: "UNKNOWN_MUTATION_SHELL", message: "logo scope permits only read-only commands or an exact registered writer invocation" };
}
