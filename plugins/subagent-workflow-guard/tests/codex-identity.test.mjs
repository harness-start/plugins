import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { codexSubagentIdentity } from "../scripts/lib/codex-identity.mjs";

function identityFixture(overrides = {}) {
  const codexHome = mkdtempSync(join(tmpdir(), "codex-identity-home-"));
  const transcriptPath = join(codexHome, "sessions", "2026", "08", "14", "child.jsonl");
  mkdirSync(dirname(transcriptPath), { recursive: true });
  const event = {
    hook_event_name: "SubagentStart",
    session_id: "parent-session",
    cwd: "/workspace",
    agent_id: "child-agent",
    transcript_path: transcriptPath,
  };
  const payload = {
    id: "child-agent",
    parent_thread_id: "parent-session",
    cwd: "/workspace",
    source: { subagent: { thread_spawn: {
      parent_thread_id: "parent-session",
      depth: 1,
      agent_path: "/root/intended_worker",
    } } },
    thread_source: "subagent",
    agent_path: "/root/intended_worker",
  };
  Object.assign(event, overrides.event);
  Object.assign(payload, overrides.payload);
  writeFileSync(transcriptPath, `${JSON.stringify({ type: "session_meta", payload })}\n`);
  return { codexHome, event, payload, transcriptPath };
}

test("Codex identity validates the event-referenced child session_meta", () => {
  const fx = identityFixture();
  assert.deepEqual(codexSubagentIdentity(fx.event, { codexHome: fx.codexHome }), {
    valid: true,
    agentPath: "/root/intended_worker",
    taskName: "intended_worker",
  });
});

test("Codex identity rejects malformed identity without consuming caller state", () => {
  for (const [name, overrides] of [
    ["agent", { payload: { id: "other-agent" } }],
    ["parent", { payload: { parent_thread_id: "other-parent" } }],
    ["cwd", { payload: { cwd: "/other" } }],
    ["path alias", { payload: { agent_path: "/root/Intended" } }],
    ["source path", { payload: { source: { subagent: { thread_spawn: { parent_thread_id: "parent-session", depth: 1, agent_path: "/root/other" } } } } }],
  ]) {
    const fx = identityFixture(overrides);
    assert.equal(codexSubagentIdentity(fx.event, { codexHome: fx.codexHome }).valid, false, name);
  }
});

test("Codex identity rejects paths outside sessions, symlinks, hardlinks, partial, oversized, and invalid UTF-8 first records", () => {
  {
    const fx = identityFixture();
    const outside = join(fx.codexHome, "outside.jsonl");
    writeFileSync(outside, "{}\n");
    assert.equal(codexSubagentIdentity({ ...fx.event, transcript_path: outside }, { codexHome: fx.codexHome }).valid, false);
  }
  {
    const fx = identityFixture();
    const link = join(dirname(fx.transcriptPath), "link.jsonl");
    symlinkSync(fx.transcriptPath, link);
    assert.equal(codexSubagentIdentity({ ...fx.event, transcript_path: link }, { codexHome: fx.codexHome }).valid, false);
  }
  {
    const fx = identityFixture();
    const link = join(dirname(fx.transcriptPath), "hard.jsonl");
    linkSync(fx.transcriptPath, link);
    assert.equal(codexSubagentIdentity(fx.event, { codexHome: fx.codexHome }).valid, false);
  }
  for (const content of [
    Buffer.from("{\"type\":\"session_meta\"}"),
    Buffer.alloc(70_000, 0x61),
    Buffer.from([0xff, 0x0a]),
  ]) {
    const fx = identityFixture();
    writeFileSync(fx.transcriptPath, content);
    assert.equal(codexSubagentIdentity(fx.event, { codexHome: fx.codexHome }).valid, false);
  }
});
