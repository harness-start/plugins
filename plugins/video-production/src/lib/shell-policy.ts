import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = resolve(
  process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? MODULE_DIRECTORY,
  process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT ? "." : "../..",
);
const TOOL_DIRECTORY = resolve(PLUGIN_DIRECTORY, "dist", "cli");
const WRITERS = new Set(["project-admit.mjs", "project-init.mjs", "project-lint.mjs", "project-probe.mjs", "project-release.mjs", "project-render.mjs", "project-review.mjs", "project-shot-stage.mjs"]);
const PROFILES = new Set(["motion-explainer", "product-promo", "short-form", "talking-head", "reference-led", "micro-drama"]);
const READ_ONLY = new Set(["file", "find", "git", "grep", "head", "jq", "ls", "pwd", "rg", "sed", "stat", "tail", "wc"]);

export type VideoShellDecision =
  | { decision: "allow"; writer?: string; projectRoot?: string; argv?: string[] }
  | { decision: "deny"; code: string; message: string };

export function parseShellWords(command: unknown): string[] | null {
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

function wrapperInvocation(words: string[] | null, cwd: string, workspaceRoot: string) {
  if (!words || words.length < 3) return null;
  const first = words[0];
  const second = words[1];
  const third = words[2];
  if (first === undefined || second === undefined || third === undefined) return null;
  if (!["node", basename(process.execPath), process.execPath].includes(first)) return null;
  if (second.startsWith("-")) return null;
  const script = isAbsolute(second) ? resolve(second) : resolve(cwd, second);
  const name = basename(script);
  if (dirname(resolve(script)) !== resolve(TOOL_DIRECTORY) || !WRITERS.has(name)) return null;
  const projectRoot = isAbsolute(third) ? resolve(third) : resolve(cwd, third);
  const expectedParent = resolve(workspaceRoot, "artifacts", "video");
  if (dirname(projectRoot) !== expectedParent || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))) return null;
  if (name === "project-init.mjs" && (words.length !== 7 || words[3] !== "--profile" || !PROFILES.has(words[4] ?? "") || words[5] !== "--mode" || !["guided", "autonomous"].includes(words[6] ?? ""))) return null;
  if (name === "project-admit.mjs" && words.length !== 4) return null;
  if (name === "project-review.mjs" && words.length !== 4) return null;
  if (name === "project-shot-stage.mjs" && words.length !== 6) return null;
  if (["project-lint.mjs", "project-probe.mjs", "project-release.mjs"].includes(name) && words.length !== 3) return null;
  if (name === "project-render.mjs" && ![4, 5].includes(words.length)) return null;
  return { name, projectRoot, argv: [script, ...words.slice(2)] };
}

function expandKnownPluginRoot(command: unknown) {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    const value = process.env[name];
    if (!value) continue;
    expanded = expanded.replaceAll(`"\${${name}}/dist/cli/`, `"${resolve(value)}/dist/cli/`);
  }
  return expanded;
}

function readOnlyCommand(words: string[] | null) {
  if (!words || words.length === 0) return false;
  const first = words[0];
  if (first === undefined) return false;
  const command = basename(first);
  if (!READ_ONLY.has(command)) return false;
  if (command === "git" && !["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(words[1] ?? "")) return false;
  if (command === "sed" && words.some((word) => /^-.*i/u.test(word))) return false;
  if (command === "find" && words.some((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))) return false;
  return true;
}

export function commandTouchesVideoScope(command: unknown, cwd: string, workspaceRoot: string) {
  const normalizedCommand = String(command ?? "").replaceAll("\\", "/");
  const normalizedCwd = resolve(cwd).replaceAll("\\", "/");
  const normalizedRoot = resolve(workspaceRoot).replaceAll("\\", "/");
  return normalizedCwd.startsWith(`${normalizedRoot}/artifacts/video/`) || /(?:^|[\s"'=])\.?\/?artifacts\/video(?:\/|[\s"']|$)/u.test(normalizedCommand) || normalizedCommand.includes(`${normalizedRoot}/artifacts/video/`);
}

export function evaluateVideoShell({ command, cwd, workspaceRoot }: {
  command: unknown;
  cwd: string;
  workspaceRoot: string;
}): VideoShellDecision {
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
