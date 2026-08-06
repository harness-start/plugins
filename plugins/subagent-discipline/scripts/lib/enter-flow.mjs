import { createHash } from "node:crypto";
import { readAgentId } from "./agent-id.mjs";
import { ensureIgnorePattern } from "./gitignore.mjs";
import { cleanupOlderThan, writeSpawnRecord } from "./ledger.mjs";
import { resolveTaskClass } from "./task-class.mjs";
import { resolveGitRoot, resolveWorkspaceRoot, readCwd } from "./workspace.mjs";
import { readAgentType, readParentBrief, readSessionId } from "./hook-io.mjs";
import { DEFAULT_HYGIENE } from "./hygiene.mjs";

const PATH_RE = /([\w@./+-]+\.[A-Za-z0-9]+)/gu;

export function extractPathsInBrief(brief, limit = 8) {
  if (typeof brief !== "string" || !brief) return [];
  const found = [];
  const seen = new Set();
  for (const m of brief.matchAll(PATH_RE)) {
    const p = m[1];
    if (seen.has(p)) continue;
    seen.add(p);
    found.push(p);
    if (found.length >= limit) break;
  }
  return found;
}

export function sha256Hex(text) {
  return createHash("sha256").update(text || "", "utf8").digest("hex");
}

/**
 * Shared enter path: requires usable agentId.
 * Performs cleanup + gitignore when workspace/git root available.
 * @returns {{ entered: false } | { entered: true, agentId, workspaceRoot, gitRoot, evidence, brief }}
 */
export function tryEnterHygieneFlow(event, evidence = DEFAULT_HYGIENE) {
  const agentId = readAgentId(event);
  if (!agentId) return { entered: false };

  const workspaceRoot = resolveWorkspaceRoot(event);
  const cwd = readCwd(event);
  const gitRoot = cwd ? resolveGitRoot(cwd) : null;
  const ttlHours = evidence.ledgerTtlHours ?? DEFAULT_HYGIENE.ledgerTtlHours;
  const ttlMs = ttlHours * 3600 * 1000;

  if (workspaceRoot) {
    try {
      cleanupOlderThan(workspaceRoot, ttlMs);
    } catch {
      // best-effort
    }
  }
  if (gitRoot) {
    try {
      ensureIgnorePattern(gitRoot);
    } catch {
      // best-effort
    }
  }

  return {
    entered: true,
    agentId,
    workspaceRoot,
    gitRoot,
    evidence,
    brief: readParentBrief(event),
    sessionId: readSessionId(event),
    agentType: readAgentType(event),
  };
}

export function buildAndWriteSpawn(ctx) {
  if (!ctx.entered || !ctx.workspaceRoot) return null;
  const { evidence, brief, agentId, sessionId, agentType } = ctx;
  const taskClass = resolveTaskClass(
    agentType,
    brief,
    evidence.agentTypeMap || {},
  );
  const record = {
    v: 1,
    agentId,
    sessionId,
    agentType,
    taskClass,
    briefSha256: sha256Hex(brief).slice(0, 16),
    briefLen: brief.length,
    pathsInBrief: extractPathsInBrief(brief),
    at: new Date().toISOString(),
  };
  if (evidence.storeBriefExcerpt) {
    record.parentBriefExcerpt = brief.slice(0, 500);
  }
  return writeSpawnRecord(ctx.workspaceRoot, agentId, record);
}
