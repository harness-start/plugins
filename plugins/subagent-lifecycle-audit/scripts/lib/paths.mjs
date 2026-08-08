import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const AUDIT_ROOT = ".subagent-lifecycle-audit";

export function resolveRepoRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

export function sanitizeSessionKey(sessionId, cwd) {
  const raw = String(sessionId ?? "").trim();
  if (raw) {
    return raw
      .replace(/[^A-Za-z0-9._-]+/gu, "_")
      .replace(/^_+|_+$/gu, "")
      .slice(0, 120) || "session";
  }
  const digest = createHash("sha256")
    .update(String(cwd ?? ""))
    .digest("hex")
    .slice(0, 16);
  return `cwd-${digest}`;
}

export function inferHost() {
  if (process.env.PLUGIN_ROOT) return "codex";
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude";
  return "unknown";
}
