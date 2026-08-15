import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export type GitPathState = {
  tracked: boolean;
  present: boolean;
  dirty: boolean;
};

export type HeadRestoreInput = {
  missing?: boolean;
  content?: string;
};

function sameDirectory(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  delete env.GIT_PREFIX;
  return env;
}

function runGit(root: string, args: string[]): Pick<SpawnSyncReturns<string>, "status" | "stdout" | "stderr"> {
  try {
    return spawnSync("git", ["-c", "safe.directory=*", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnv(),
    });
  } catch {
    return { status: 1, stdout: "", stderr: "" };
  }
}

export function hasGitHead(root: string): boolean {
  if (!root) return false;
  const inside = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return false;
  const toplevel = runGit(root, ["rev-parse", "--show-toplevel"]);
  if (toplevel.status !== 0 || !sameDirectory(toplevel.stdout.trim(), root)) return false;
  const head = runGit(root, ["rev-parse", "HEAD"]);
  return head.status === 0 && Boolean(head.stdout.trim());
}

export function gitShowHead(root: string, relativePath: string): string | null {
  const path = String(relativePath ?? "").replaceAll("\\", "/");
  if (!root || !path || path === ".") return null;
  const shown = runGit(root, ["show", `HEAD:${path}`]);
  if (shown.status !== 0) return null;
  return shown.stdout;
}

export function gitPathState(root: string, relativePath: string): GitPathState {
  try {
    const head = gitShowHead(root, relativePath);
    const tracked = head !== null;
    const absolutePath = resolve(root, relativePath);
    const present = existsSync(absolutePath);
    if (!tracked && !present) return { tracked: false, present: false, dirty: false };
    if (!tracked) return { tracked: false, present: true, dirty: true };
    if (!present) return { tracked: true, present: false, dirty: true };
    let current = "";
    try {
      current = readFileSync(absolutePath, "utf8");
    } catch {
      return { tracked: true, present: true, dirty: true };
    }
    return { tracked: true, present: true, dirty: current !== head };
  } catch {
    return { tracked: false, present: false, dirty: false };
  }
}

export function listHeadPaths(root: string): string[] {
  const listed = runGit(root, ["ls-tree", "-r", "--name-only", "HEAD"]);
  if (listed.status !== 0) return [];
  return listed.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
}

export function isHeadContent(root: string, relativePath: string, content: string): boolean {
  const head = gitShowHead(root, relativePath);
  return head !== null && head === String(content ?? "");
}

export function restoresHeadState(root: string, relativePath: string, { missing = false, content = "" }: HeadRestoreInput = {}): boolean {
  const head = gitShowHead(root, relativePath);
  if (head === null) return missing === true;
  if (missing) return false;
  return head === String(content ?? "");
}
