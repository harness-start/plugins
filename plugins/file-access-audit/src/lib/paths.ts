import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

export function resolveRepoRoot(cwd) {
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

export function toDisplayPath(filePath, base) {
  const abs = resolve(filePath);
  if (!base) return abs.replaceAll("\\", "/");
  const candidate = relative(base, abs).replaceAll("\\", "/");
  if (
    candidate &&
    candidate !== ".." &&
    !candidate.startsWith("../") &&
    !isAbsolute(candidate)
  ) {
    return candidate;
  }
  return abs.replaceAll("\\", "/");
}

export function inferHost(event) {
  if (process.env.PLUGIN_ROOT && !process.env.CLAUDE_PLUGIN_ROOT) return "codex";
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude";
  if (event?.hook_event_name || event?.hookEventName) {
    // Both hosts set this; keep unknown unless env is clear.
  }
  return "unknown";
}
