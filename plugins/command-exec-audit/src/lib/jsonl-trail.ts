import { existsSync, readFileSync } from "node:fs";

import {
  appendRecord,
  prepareTrail as prepareCoreTrail,
  readLastNonEmptyLine,
  rewriteTip,
  sanitizeSessionKey,
  trailPaths,
} from "@harness/core/jsonl-trail";
import { isRecord } from "@harness/core/hook-event";

const README_TEXT = `# Command exec audit

Append-only JSONL trail of agent shell commands (status + duration only; one file per session).

Write policy:
- The audit plugin may append new lines.
- The audit plugin may rewrite only the last line (pending → terminal).
- Earlier lines must not be modified by agents or automation tools.
`;

export { appendRecord, readLastNonEmptyLine, rewriteTip, sanitizeSessionKey, trailPaths };

export function findPendingByToolUseId(
  sessionPath: string,
  toolUseId: unknown,
): Record<string, unknown> | null {
  const id = String(toolUseId ?? "").trim();
  if (!id || !existsSync(sessionPath)) return null;
  const content = readFileSync(sessionPath, "utf8");
  let found: Record<string, unknown> | null = null;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        isRecord(parsed)
        && parsed.schema === "command-exec/v1"
        && parsed.status === "pending"
        && String(parsed.tool_use_id ?? "") === id
      ) {
        found = parsed;
      }
    } catch {
      // skip corrupt lines
    }
  }
  return found;
}

export function prepareTrail(repoRoot: string, auditRoot: string, sessionKey: string) {
  return prepareCoreTrail(repoRoot, auditRoot, sessionKey, { readme: README_TEXT });
}
