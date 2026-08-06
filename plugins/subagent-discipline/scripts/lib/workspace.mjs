import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve session cwd from hook event.
 */
export function readCwd(event) {
  const cwd = event?.cwd ?? event?.Cwd;
  if (typeof cwd === "string" && cwd.trim()) return resolve(cwd.trim());
  const roots = event?.workspace_roots ?? event?.workspaceRoots;
  if (Array.isArray(roots) && typeof roots[0] === "string" && roots[0].trim()) {
    return resolve(roots[0].trim());
  }
  return null;
}

/**
 * Git toplevel from cwd, or null.
 */
export function resolveGitRoot(cwd) {
  if (!cwd) return null;
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const root = out.trim();
    return root && existsSync(root) ? root : null;
  } catch {
    return null;
  }
}

/**
 * Prefer git root for ledger/gitignore; fall back to cwd.
 */
export function resolveWorkspaceRoot(event) {
  const cwd = readCwd(event);
  if (!cwd) return null;
  return resolveGitRoot(cwd) ?? cwd;
}
