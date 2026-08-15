import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

function sameDirectory(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  delete env.GIT_PREFIX;
  return env;
}

function runGit(root, args) {
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

export function hasGitHead(root) {
  if (!root) return false;
  const inside = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return false;
  const toplevel = runGit(root, ["rev-parse", "--show-toplevel"]);
  if (toplevel.status !== 0 || !sameDirectory(toplevel.stdout.trim(), root)) return false;
  const head = runGit(root, ["rev-parse", "HEAD"]);
  return head.status === 0 && Boolean(head.stdout.trim());
}

export function gitShowHead(root, relativePath) {
  const path = String(relativePath ?? "").replaceAll("\\", "/");
  if (!root || !path || path === ".") return null;
  const shown = runGit(root, ["show", `HEAD:${path}`]);
  if (shown.status !== 0) return null;
  return shown.stdout;
}

export function gitPathState(root, relativePath) {
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

export function listHeadPaths(root) {
  const listed = runGit(root, ["ls-tree", "-r", "--name-only", "HEAD"]);
  if (listed.status !== 0) return [];
  return listed.stdout.split("\n").map((path) => path.trim()).filter(Boolean);
}

export function isHeadContent(root, relativePath, content) {
  const head = gitShowHead(root, relativePath);
  return head !== null && head === String(content ?? "");
}

export function restoresHeadState(root, relativePath, { missing = false, content = "" } = {}) {
  const head = gitShowHead(root, relativePath);
  if (head === null) return missing === true;
  if (missing) return false;
  return head === String(content ?? "");
}
