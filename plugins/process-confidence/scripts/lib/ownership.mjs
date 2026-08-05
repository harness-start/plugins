/**
 * Ownership: run.sessionId must match acting sessionId for mutations.
 */

export function ownsRun(run, sessionId) {
  if (!run || !sessionId) return false;
  return run.sessionId === sessionId;
}

export function assertOwnsRun(run, sessionId) {
  if (!run) {
    return { ok: false, reason: "run-not-found" };
  }
  if (!ownsRun(run, sessionId)) {
    return { ok: false, reason: "session-ownership-mismatch" };
  }
  return { ok: true };
}

/**
 * Resolve which run a path under .process-confidence/runs/<runId>/ belongs to.
 */
export function runIdFromPath(filePath) {
  if (!filePath) return null;
  const norm = String(filePath).replaceAll("\\", "/");
  const m = norm.match(/\.process-confidence\/runs\/([^/]+)/);
  return m ? m[1] : null;
}

export function isProcessConfidencePath(filePath) {
  if (!filePath) return false;
  return String(filePath).replaceAll("\\", "/").includes("/.process-confidence/")
    || String(filePath).replaceAll("\\", "/").includes(".process-confidence/");
}

export function isProtectedMachinePath(filePath) {
  const norm = String(filePath || "").replaceAll("\\", "/");
  if (!norm.includes(".process-confidence")) return false;
  if (/\/receipts\//.test(norm) || /\/receipts$/.test(norm)) return true;
  if (/\/run\.json$/.test(norm)) return true;
  if (/\/ACTIVE\.md$/.test(norm)) return true;
  if (/\/session-state\//.test(norm)) return true;
  if (/\/archive\//.test(norm)) return true;
  if (/\/config\.yaml$/.test(norm)) return false; // agent may tune config
  return false;
}

export function isStagePath(filePath) {
  const norm = String(filePath || "").replaceAll("\\", "/");
  return /\.process-confidence\/runs\/[^/]+\/stages\//.test(norm);
}

/** Business paths: not under .process-confidence, not evidence export only. */
export function isBusinessPath(filePath) {
  if (!filePath) return false;
  const norm = String(filePath).replaceAll("\\", "/");
  if (norm.includes(".process-confidence")) return false;
  if (norm.includes("/docs/process-evidence/")) return false;
  // Ignore common non-code noise
  if (/(?:^|\/)(?:\.git|node_modules|dist|build|coverage|\.next)\//.test(norm)) {
    return false;
  }
  return true;
}
