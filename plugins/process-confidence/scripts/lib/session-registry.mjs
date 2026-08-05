/**
 * validateSessionId — read-only probe of ~/.claude and ~/.codex.
 * Design: docs/design.md §3.3.3
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { resolveClaudeHome, resolveCodexHome } from "./paths.mjs";

/** Platform-visible id charset (UUID / ULID / similar). Reject path traversal. */
export const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidSessionIdCharset(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return false;
  if (sessionId.includes("/") || sessionId.includes("\\") || sessionId.includes("..")) {
    return false;
  }
  return SESSION_ID_RE.test(sessionId);
}

/**
 * @param {string} sessionId
 * @param {{ claudeHome?: string, codexHome?: string, config?: object }} [opts]
 * @returns {{ ok: true, agent: string, evidence: string } | { ok: false, reason: string }}
 */
export function validateSessionId(sessionId, opts = {}) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { ok: false, reason: "invalid-session-id" };
  }
  const id = sessionId.trim();
  if (!isValidSessionIdCharset(id)) {
    return { ok: false, reason: "invalid-session-id" };
  }

  const config = opts.config ?? {};
  const claudeHome = opts.claudeHome ?? resolveClaudeHome(config);
  const codexHome = opts.codexHome ?? resolveCodexHome(config);

  const claude = claudeEvidence(id, claudeHome);
  const codex = codexEvidence(id, codexHome);

  if (claude.hit && codex.hit) {
    return {
      ok: true,
      agent: "ambiguous",
      evidence: `${claude.evidence}; ${codex.evidence}`,
    };
  }
  if (claude.hit) {
    return { ok: true, agent: "claude", evidence: claude.evidence };
  }
  if (codex.hit) {
    return { ok: true, agent: "codex", evidence: codex.evidence };
  }
  return { ok: false, reason: "session-not-found-in-registry" };
}

function claudeEvidence(sessionId, claudeHome) {
  // C1: session-env/<id>/
  const envDir = join(claudeHome, "session-env", sessionId);
  if (existsSync(envDir)) {
    try {
      if (statSync(envDir).isDirectory()) {
        return { hit: true, evidence: `claude:session-env/${sessionId}` };
      }
    } catch {
      /* continue */
    }
  }

  // C2/C3: projects/*/<id>.jsonl or projects/*/<id>/
  const projects = join(claudeHome, "projects");
  if (!existsSync(projects)) return { hit: false };

  let projectDirs = [];
  try {
    projectDirs = readdirSync(projects);
  } catch {
    return { hit: false };
  }

  for (const proj of projectDirs) {
    const base = join(projects, proj);
    const jsonl = join(base, `${sessionId}.jsonl`);
    if (existsSync(jsonl)) {
      return {
        hit: true,
        evidence: `claude:projects/${proj}/${sessionId}.jsonl`,
      };
    }
    const asDir = join(base, sessionId);
    try {
      if (existsSync(asDir) && statSync(asDir).isDirectory()) {
        return {
          hit: true,
          evidence: `claude:projects/${proj}/${sessionId}/`,
        };
      }
    } catch {
      /* continue */
    }
  }
  return { hit: false };
}

function codexEvidence(sessionId, codexHome) {
  // X1: session_index.jsonl line with id field
  const indexPath = join(codexHome, "session_index.jsonl");
  if (existsSync(indexPath)) {
    try {
      const text = readFileSync(indexPath, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          if (row && row.id === sessionId) {
            return {
              hit: true,
              evidence: "codex:session_index.jsonl",
            };
          }
        } catch {
          /* skip bad line */
        }
      }
    } catch {
      /* continue */
    }
  }

  // X2: sessions/** filename contains sessionId
  const sessionsDir = join(codexHome, "sessions");
  if (existsSync(sessionsDir)) {
    const found = walkFindNameContains(sessionsDir, sessionId, 0, 6);
    if (found) {
      return { hit: true, evidence: `codex:sessions/**/${found}` };
    }
  }
  return { hit: false };
}

function walkFindNameContains(dir, needle, depth, maxDepth) {
  if (depth > maxDepth) return null;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    if (ent.name.includes(needle)) return ent.name;
    if (ent.isDirectory()) {
      const nested = walkFindNameContains(
        join(dir, ent.name),
        needle,
        depth + 1,
        maxDepth,
      );
      if (nested) return nested;
    }
  }
  return null;
}
