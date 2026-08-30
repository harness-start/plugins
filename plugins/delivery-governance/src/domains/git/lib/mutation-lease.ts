import { mkdirSync, readFileSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";
import { atomicWriteJson } from "@harness/core/state-file";

import { gitInvocations } from "../checks/command-rules.js";
import { WORKTREE_STATE_DIR } from "./worktree-intent.js";

const LEASE_TTL_MS = 10 * 60 * 1000;
const MUTATING_GIT_ACTIONS = new Set([
  "add", "am", "checkout", "cherry-pick", "commit", "merge", "mv", "pull",
  "rebase", "reset", "restore", "rm", "stash", "switch", "worktree",
]);

type MutationLease = {
  version: 1;
  sessionId: string;
  touchedAt: number;
  expiresAt: number;
};

export type MutationLeaseDecision =
  | { action: "acquired"; lease: MutationLease }
  | { action: "blocked"; holder: string; expiresAt: number };

function paths(root: string) {
  const state = resolve(root, WORKTREE_STATE_DIR);
  return {
    state,
    lease: join(state, "worktree-mutation-lease.json"),
    lock: join(state, "worktree-mutation-lease.lock"),
  };
}

function readLease(path: string): MutationLease | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(value) || value.version !== 1 || typeof value.sessionId !== "string"
      || typeof value.touchedAt !== "number" || typeof value.expiresAt !== "number") return null;
    return { version: 1, sessionId: value.sessionId, touchedAt: value.touchedAt, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

function withLock<T>(root: string, fallback: T, operation: (leasePath: string) => T): T {
  const target = paths(root);
  mkdirSync(target.state, { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(resolve(root, ".git-delivery"));
  try {
    mkdirSync(target.lock, { mode: 0o700 });
  } catch {
    return fallback;
  }
  try {
    return operation(target.lease);
  } finally {
    try { rmdirSync(target.lock); } catch { /* another Hook will fail closed on the busy lock */ }
  }
}

export function acquireWorktreeMutationLease(root: string, sessionId: string, now = Date.now()): MutationLeaseDecision {
  const missing = { action: "blocked", holder: "unknown", expiresAt: now + LEASE_TTL_MS } as const;
  if (!sessionId) return missing;
  return withLock(root, missing, (leasePath) => {
    const current = readLease(leasePath);
    if (current && current.sessionId !== sessionId && current.expiresAt > now) {
      return { action: "blocked", holder: current.sessionId, expiresAt: current.expiresAt };
    }
    const lease: MutationLease = { version: 1, sessionId, touchedAt: now, expiresAt: now + LEASE_TTL_MS };
    if (!atomicWriteJson(leasePath, lease)) return missing;
    return { action: "acquired", lease };
  });
}

export function releaseWorktreeMutationLease(root: string, sessionId: string): boolean {
  if (!sessionId) return false;
  return withLock(root, false, (leasePath) => {
    const current = readLease(leasePath);
    if (!current || current.sessionId !== sessionId) return false;
    return atomicWriteJson(leasePath, { ...current, touchedAt: Date.now(), expiresAt: 0 });
  });
}

export function commandMutatesGitWorktree(command: string, cwd: string): boolean {
  return gitInvocations(command, cwd).some((invocation) => {
    if (!MUTATING_GIT_ACTIONS.has(invocation.subcommand)) return false;
    const action = invocation.args[0] ?? "";
    if (invocation.subcommand === "worktree") return action !== "" && action !== "list";
    if (invocation.subcommand === "stash") return action !== "list" && action !== "show";
    return true;
  });
}
