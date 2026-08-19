import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isRecord } from "@harness/core/hook-event";
import { ensurePluginWorkdirGitignore } from "@harness/core/plugin-workdir";
import { atomicWriteJson, digestKey } from "@harness/core/state-file";

export type WorktreeCreateMode = "block" | "report" | "allow";

export type WorktreeCreateSource = "user-prompt" | "process";

export type WorktreeCreateReceipt = {
  version: 1;
  allowed: true;
  source: WorktreeCreateSource;
  createdAt: string;
  process?: string;
};

export const WORKTREE_STATE_DIR = ".git-delivery/state";
const RECEIPT_VERSION = 1;
const PROCESS_ID = /^[^:\s]+:\S+$/u;

const CREATION_PATTERNS = [
  /\b(?:create|creating|use|using)\s+(?:a |an |the )?(?:linked |isolated )?(?:git\s+)?worktree\b/iu,
  /(?:用|使用)\s*git\s+worktree\b/iu,
  /隔离\s*(?:工作区|checkout|检出|审查)/iu,
  /\bisolation\s*[:=]\s*worktree\b/iu,
  /\.worktrees\//u,
  /(?:创建|新建|开一个)[^。.\n]{0,20}worktree/iu,
  /worktree[^。.\n]{0,20}(?:创建|新建)/iu,
];

function stripNegatedSpans(text: string): string {
  return text
    .replace(/(?:不要|别|勿|禁止)[^。\n]{0,40}(?:git\s+)?worktree\b(?:\s+\S+)*/giu, " ")
    .replace(/(?:do not|don't|without)\s+(?:use |create |creating )?(?:a |an )?(?:git\s+)?worktree\b(?:\s+\S+)*/giu, " ")
    .replace(/不要改\s*git\s*工作区/giu, " ");
}

export function userRequestedWorktreeCreate(prompt: unknown): boolean {
  if (typeof prompt !== "string" || !prompt.trim()) return false;
  const remaining = stripNegatedSpans(prompt);
  return CREATION_PATTERNS.some((pattern) => pattern.test(remaining));
}

export function worktreeIsolationRequested(toolInput: unknown): boolean {
  if (!isRecord(toolInput)) return false;
  const isolation = toolInput.isolation ?? toolInput.Isolation;
  if (isolation === "worktree") return true;
  return isRecord(isolation)
    && (isolation.type === "worktree" || isolation.mode === "worktree");
}

export function worktreeCreateReceiptPath(cwd: string, sessionId: string): string {
  return join(
    resolve(cwd),
    WORKTREE_STATE_DIR,
    "sessions",
    digestKey(sessionId || "missing"),
    "worktree-create.json",
  );
}

function isWorktreeCreateSource(value: unknown): value is WorktreeCreateSource {
  return value === "user-prompt" || value === "process";
}

function parseReceipt(value: unknown): WorktreeCreateReceipt | null {
  if (!isRecord(value) || value.version !== RECEIPT_VERSION || value.allowed !== true) {
    return null;
  }
  if (!isWorktreeCreateSource(value.source) || typeof value.createdAt !== "string" || !value.createdAt) {
    return null;
  }
  if (value.source === "process") {
    if (typeof value.process !== "string" || !PROCESS_ID.test(value.process)) return null;
    return {
      version: 1,
      allowed: true,
      source: "process",
      createdAt: value.createdAt,
      process: value.process,
    };
  }
  return {
    version: 1,
    allowed: true,
    source: "user-prompt",
    createdAt: value.createdAt,
  };
}

export function readWorktreeCreateReceipt(cwd: string, sessionId: string): WorktreeCreateReceipt | null {
  if (!sessionId) return null;
  try {
    return parseReceipt(JSON.parse(readFileSync(worktreeCreateReceiptPath(cwd, sessionId), "utf8")));
  } catch {
    return null;
  }
}

export function recordWorktreeCreateAllowance(
  cwd: string,
  sessionId: string,
  source: WorktreeCreateSource,
  processId?: string,
): boolean {
  if (!sessionId) return false;
  const createdAt = new Date().toISOString();
  let receipt: WorktreeCreateReceipt;
  if (source === "process") {
    if (typeof processId !== "string" || !PROCESS_ID.test(processId)) return false;
    receipt = { version: 1, allowed: true, source, createdAt, process: processId };
  } else {
    receipt = { version: 1, allowed: true, source, createdAt };
  }
  const path = worktreeCreateReceiptPath(cwd, sessionId);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  ensurePluginWorkdirGitignore(join(resolve(cwd), ".git-delivery"));
  return atomicWriteJson(path, receipt);
}

export function isWorktreeCreatePermitted(
  mode: WorktreeCreateMode,
  receipt: WorktreeCreateReceipt | null,
): boolean {
  if (mode === "allow") return true;
  return receipt?.allowed === true;
}
