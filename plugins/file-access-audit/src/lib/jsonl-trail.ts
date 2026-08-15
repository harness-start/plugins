import {
  appendRecord,
  prepareTrail as prepareCoreTrail,
  rewriteTip,
  sanitizeSessionKey,
  trailPaths,
} from "@harness/core/jsonl-trail";

const README_TEXT = `# File access audit

Append-only JSONL trail of structured agent file reads/writes (one file per session).

Write policy:
- The audit plugin may append new lines.
- The audit plugin may rewrite only the last line.
- Earlier lines must not be modified by agents or humans' automation tools.
`;

export { appendRecord, rewriteTip, sanitizeSessionKey, trailPaths };

export function prepareTrail(repoRoot, auditRoot, sessionKey) {
  return prepareCoreTrail(repoRoot, auditRoot, sessionKey, { readme: README_TEXT });
}
