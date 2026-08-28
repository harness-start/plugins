import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateCodexReviewIdentity } from "../../src/lib/codex-review-identity.ts";

test("validates the child thread and parent chain from a real Codex session_meta record", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "codex-review-identity-"));
  const codexHome = join(sandbox, "codex-home");
  const project = join(sandbox, "artifacts", "logo", "orbit-logo");
  const transcript = join(codexHome, "sessions", "2026", "08", "20", "child.jsonl");
  const parentSessionId = "01a01ed8-b75a-75f3-85a5-08af20547d97";
  const childSessionId = "01a01f03-bea2-7713-884e-d2438afd194c";
  try {
    mkdirSync(join(codexHome, "sessions", "2026", "08", "20"), { recursive: true });
    await writeFile(transcript, `${JSON.stringify({
      type: "session_meta",
      payload: {
        id: childSessionId,
        session_id: parentSessionId,
        forked_from_id: parentSessionId,
        parent_thread_id: parentSessionId,
        cwd: project,
        thread_source: "subagent",
        source: { subagent: { thread_spawn: { parent_thread_id: parentSessionId, depth: 1, agent_path: "/root/logo_review" } } },
        agent_path: "/root/logo_review",
      },
    })}\n`);
    const identity = validateCodexReviewIdentity({
      transcriptPath: transcript,
      reviewerSessionId: childSessionId,
      currentThreadId: childSessionId,
      projectRoot: project,
    }, { codexHome });
    assert.deepEqual(identity.valid ? {
      valid: identity.valid,
      sessionId: identity.sessionId,
      parentSessionId: identity.parentSessionId,
      agentPath: identity.agentPath,
      taskName: identity.taskName,
    } : identity, {
      valid: true,
      sessionId: childSessionId,
      parentSessionId,
      agentPath: "/root/logo_review",
      taskName: "logo_review",
    });
    if (identity.valid) assert.match(identity.sessionMetaSha256, /^[a-f0-9]{64}$/u);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
