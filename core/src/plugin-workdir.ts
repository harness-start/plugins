import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PLUGIN_WORKDIR_GITIGNORE = "*\n";

function normalizeGitignore(text: string): string {
  return String(text ?? "").replace(/\r\n/gu, "\n").trim();
}

export function isStalePluginWorkdirGitignore(text: string): boolean {
  const value = normalizeGitignore(text);
  return value === "" || value === "state/" || value === "sessions/";
}

export function ensurePluginWorkdirGitignore(pluginRoot: string): void {
  mkdirSync(pluginRoot, { recursive: true, mode: 0o700 });
  const ignore = join(pluginRoot, ".gitignore");
  let current: string | null = null;
  try {
    current = readFileSync(ignore, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current !== null && normalizeGitignore(current) === "*") return;
  if (current !== null && !isStalePluginWorkdirGitignore(current)) return;
  writeFileSync(ignore, PLUGIN_WORKDIR_GITIGNORE, { encoding: "utf8", mode: 0o600 });
}
