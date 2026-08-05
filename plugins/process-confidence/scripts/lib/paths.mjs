/**
 * Workspace / plugin path helpers for process-confidence.
 * Production area: <cwd>/.process-confidence/
 */

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Plugin root (plugins/process-confidence) */
export function pluginRoot() {
  return resolve(__dirname, "../..");
}

export function templatesDir() {
  return join(pluginRoot(), "templates");
}

/**
 * Resolve workspace root: prefer git toplevel, else cwd.
 */
export function resolveWorkspaceRoot(cwd = process.cwd()) {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    if (root) return root;
  } catch {
    // not a git repo
  }
  return resolve(cwd);
}

export function pcfRoot(workspaceRoot) {
  return join(workspaceRoot, ".process-confidence");
}

export function runsDir(workspaceRoot) {
  return join(pcfRoot(workspaceRoot), "runs");
}

export function archiveDir(workspaceRoot) {
  return join(pcfRoot(workspaceRoot), "archive");
}

export function activePath(workspaceRoot) {
  return join(pcfRoot(workspaceRoot), "ACTIVE.md");
}

export function configPath(workspaceRoot) {
  return join(pcfRoot(workspaceRoot), "config.yaml");
}

export function runDir(workspaceRoot, runId) {
  return join(runsDir(workspaceRoot), runId);
}

export function runJsonPath(workspaceRoot, runId) {
  return join(runDir(workspaceRoot, runId), "run.json");
}

export function stagesDir(workspaceRoot, runId) {
  return join(runDir(workspaceRoot, runId), "stages");
}

export function receiptsDir(workspaceRoot, runId) {
  return join(runDir(workspaceRoot, runId), "receipts");
}

export function sessionStateDir(workspaceRoot) {
  return join(pcfRoot(workspaceRoot), "session-state");
}

export function sessionStatePath(workspaceRoot, sessionId) {
  return join(sessionStateDir(workspaceRoot), `${safeFileName(sessionId)}.json`);
}

export function evidenceDir(workspaceRoot) {
  return join(workspaceRoot, "docs", "process-evidence");
}

export function ensurePcfLayout(workspaceRoot) {
  for (const dir of [
    pcfRoot(workspaceRoot),
    runsDir(workspaceRoot),
    archiveDir(workspaceRoot),
    sessionStateDir(workspaceRoot),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function safeFileName(id) {
  return String(id).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180);
}

export function isPathInside(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}

export function expandHome(pathLike, home = homedir()) {
  if (!pathLike || pathLike === "~") return home;
  if (pathLike.startsWith("~/")) return join(home, pathLike.slice(2));
  return pathLike;
}

export function listSubdirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

export function resolveClaudeHome(config = {}) {
  if (process.env.CLAUDE_HOME) return expandHome(process.env.CLAUDE_HOME);
  if (config.claudeHome) {
    const base = expandHome(config.claudeHome);
    return base.endsWith(`${sep}.claude`) || base.endsWith("/.claude")
      ? base
      : join(base, ".claude");
  }
  return join(homedir(), ".claude");
}

export function resolveCodexHome(config = {}) {
  if (process.env.CODEX_HOME) return expandHome(process.env.CODEX_HOME);
  if (config.codexHome) {
    const base = expandHome(config.codexHome);
    return base.endsWith(`${sep}.codex`) || base.endsWith("/.codex")
      ? base
      : join(base, ".codex");
  }
  return join(homedir(), ".codex");
}
