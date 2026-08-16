import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

export function resolveRepoRoot(cwd: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

export function inferHost(): "codex" | "claude" | "unknown" {
  if (process.env.PLUGIN_ROOT && !process.env.CLAUDE_PLUGIN_ROOT) return "codex";
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude";
  return "unknown";
}

export function toDisplayPath(filePath: string, base: string | null | undefined): string {
  const absolute = resolve(filePath);
  if (!base) return absolute.replaceAll("\\", "/");
  const candidate = relative(base, absolute).replaceAll("\\", "/");
  return candidate && candidate !== ".." && !candidate.startsWith("../") && !isAbsolute(candidate)
    ? candidate
    : absolute.replaceAll("\\", "/");
}
