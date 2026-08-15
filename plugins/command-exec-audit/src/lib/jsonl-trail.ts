import { existsSync, readFileSync } from "node:fs";

import {
  appendRecord,
  prepareTrail as prepareCoreTrail,
  readLastNonEmptyLine,
  rewriteTip,
  sanitizeSessionKey,
  trailPaths,
} from "@harness/core/jsonl-trail";

const README_TEXT = `# Command exec audit

Append-only JSONL trail of agent shell commands (status + duration only; one file per session).

Write policy:
- The audit plugin may append new lines.
- The audit plugin may rewrite only the last line (pending → terminal).
- Earlier lines must not be modified by agents or automation tools.
`;

const GITIGNORE_TEXT = "sessions/\n";

export { appendRecord, readLastNonEmptyLine, rewriteTip, sanitizeSessionKey, trailPaths };

export function findPendingByToolUseId(sessionPath, toolUseId) {
  const id = String(toolUseId ?? "").trim();
  if (!id || !existsSync(sessionPath)) return null;
  const content = readFileSync(sessionPath, "utf8");
  let found = null;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.schema === "command-exec/v1" && parsed.status === "pending" && String(parsed.tool_use_id ?? "") === id) {
        found = parsed;
      }
    } catch {
      // skip corrupt lines
    }
  }
  return found;
}

export function prepareTrail(repoRoot, auditRoot, sessionKey) {
  return prepareCoreTrail(repoRoot, auditRoot, sessionKey, { gitignore: GITIGNORE_TEXT, readme: README_TEXT });
}
