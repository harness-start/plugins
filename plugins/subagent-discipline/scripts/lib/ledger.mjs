import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { LEDGER_DIRNAME } from "./policy.mjs";
import { isUsableAgentId } from "./agent-id.mjs";

export function ledgerRoot(workspaceRoot) {
  return join(workspaceRoot, LEDGER_DIRNAME);
}

export function spawnsDir(workspaceRoot) {
  return join(ledgerRoot(workspaceRoot), "spawns");
}

export function returnsDir(workspaceRoot) {
  return join(ledgerRoot(workspaceRoot), "returns");
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/**
 * Delete managed ledger files older than ttlMs (by mtime).
 * @returns {number} deleted count
 */
export function cleanupOlderThan(workspaceRoot, ttlMs, now = Date.now()) {
  if (!workspaceRoot || !Number.isFinite(ttlMs) || ttlMs <= 0) return 0;
  const root = ledgerRoot(workspaceRoot);
  if (!existsSync(root)) return 0;

  const cutoff = now - ttlMs;
  let deleted = 0;

  for (const sub of ["spawns", "returns"]) {
    const dir = join(root, sub);
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const path = join(dir, ent.name);
      try {
        const st = statSync(path);
        if (st.mtimeMs < cutoff) {
          unlinkSync(path);
          deleted += 1;
        }
      } catch {
        // ignore
      }
    }
  }
  return deleted;
}

export function writeSpawnRecord(workspaceRoot, agentId, record) {
  if (!workspaceRoot || !isUsableAgentId(agentId)) return null;
  const dir = spawnsDir(workspaceRoot);
  ensureDir(dir);
  const path = join(dir, `${agentId}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}

export function readSpawnRecord(workspaceRoot, agentId) {
  if (!workspaceRoot || !isUsableAgentId(agentId)) return null;
  const path = join(spawnsDir(workspaceRoot), `${agentId}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeReturnRecord(workspaceRoot, agentId, record) {
  if (!workspaceRoot || !isUsableAgentId(agentId)) return null;
  const dir = returnsDir(workspaceRoot);
  ensureDir(dir);
  const stamp = (record.at || new Date().toISOString()).replace(
    /[-:TZ.]/gu,
    "",
  );
  const path = join(dir, `${agentId}-${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}

/**
 * Count return records for agentId (for attempt tracking).
 */
export function countReturnAttempts(workspaceRoot, agentId) {
  if (!workspaceRoot || !isUsableAgentId(agentId)) return 0;
  const dir = returnsDir(workspaceRoot);
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter(
      (name) => name.startsWith(`${agentId}-`) && name.endsWith(".json"),
    ).length;
  } catch {
    return 0;
  }
}
