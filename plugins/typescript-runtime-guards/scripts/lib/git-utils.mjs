/**
 * Read-only git helpers: repo root and HEAD content for a file.
 * Used by the net-new debt / debug statement checks to compute a baseline.
 * Only read-only git queries are allowed here.
 */

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const GIT_TIMEOUT_MS = 5000;

export function readGitHeadContent(filePath) {
  try {
    const cwd = dirname(filePath);
    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GIT_TIMEOUT_MS,
    }).trim();
    const realRoot = realpathSync(repoRoot);
    const realFile = existsSync(filePath) ? realpathSync(filePath) : resolve(filePath);
    const relPath = relative(realRoot, realFile).replaceAll("\\", "/");
    return execFileSync("git", ["show", `HEAD:${relPath}`], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GIT_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
}
