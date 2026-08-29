import { basename, dirname, isAbsolute, resolve } from "node:path";

export function parseShellWords(command: string): string[] | null {
  const words: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaped = false;
  for (const char of String(command ?? "")) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (quote === "\"" && (char === "$" || char === "`")) return null;
      current += char;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    if (/[;&|><`$(){}\n\r]/u.test(char)) return null;
    current += char;
  }
  if (escaped || quote) return null;
  if (current) words.push(current);
  return words;
}

export function expandKnownPluginRoot(command: string, env: NodeJS.ProcessEnv = process.env): string {
  let expanded = String(command ?? "");
  for (const name of ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"]) {
    if (env[name]) expanded = expanded.replaceAll(`\${${name}}`, resolve(env[name] ?? ""));
  }
  return expanded;
}

export type RegisteredWriterResult =
  | { ok: true; writer: string; projectRoot: string }
  | { ok: false };

export function evaluateRegisteredWriter(options: {
  command: string;
  cwd: string;
  workspaceRoot: string;
  carrier: string;
  writers: readonly string[];
  toolDirectory: string;
  resource: string;
}): RegisteredWriterResult {
  const words = parseShellWords(expandKnownPluginRoot(options.command));
  if (!words || words.length < 5) return { ok: false };
  if (!["node", basename(process.execPath), process.execPath].includes(words[0] ?? "")) return { ok: false };
  if (words[1]?.startsWith("-")) return { ok: false };
  const script = isAbsolute(words[1] ?? "") ? resolve(words[1] ?? "") : resolve(options.cwd, words[1] ?? "");
  if (dirname(script) !== resolve(options.toolDirectory) || basename(script) !== "harness.mjs") return { ok: false };
  if (words[2] !== options.resource) return { ok: false };
  const name = `project-${words[3] ?? ""}.mjs`;
  if (!options.writers.includes(name)) return { ok: false };
  const projectRoot = isAbsolute(words[4] ?? "") ? resolve(words[4] ?? "") : resolve(options.cwd, words[4] ?? "");
  if (
    dirname(projectRoot) !== resolve(options.workspaceRoot, "artifacts", options.carrier)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(projectRoot))
  ) {
    return { ok: false };
  }
  return { ok: true, writer: name, projectRoot };
}
