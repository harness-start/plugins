import { execFileSync } from "node:child_process";

/**
 * Best-effort workspace git diff non-empty check.
 * @returns {"true"|"false"|"unknown"}
 */
export function detectWorkspaceDiff(workspaceRoot) {
  if (!workspaceRoot) return "unknown";
  try {
    const unstaged = execFileSync("git", ["diff", "--stat"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const staged = execFileSync("git", ["diff", "--cached", "--stat"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (unstaged || staged) return "true";
    return "false";
  } catch {
    return "unknown";
  }
}
