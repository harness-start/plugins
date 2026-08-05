import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateSessionId,
  isValidSessionIdCharset,
} from "../scripts/lib/session-registry.mjs";

describe("session-registry", () => {
  let root;
  let claudeHome;
  let codexHome;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "pcf-reg-"));
    claudeHome = join(root, ".claude");
    codexHome = join(root, ".codex");
    mkdirSync(join(claudeHome, "session-env"), { recursive: true });
    mkdirSync(join(claudeHome, "projects", "proj1"), { recursive: true });
    mkdirSync(join(codexHome, "sessions", "2026"), { recursive: true });
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects empty and path traversal", () => {
    assert.equal(isValidSessionIdCharset(""), false);
    assert.equal(isValidSessionIdCharset("../etc"), false);
    assert.equal(isValidSessionIdCharset("a/b"), false);
    assert.equal(isValidSessionIdCharset("sess-abc_01"), true);
  });

  it("fails when not in any registry", () => {
    const r = validateSessionId("missing-session-id-xyz", {
      claudeHome,
      codexHome,
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "session-not-found-in-registry");
  });

  it("accepts claude session-env evidence", () => {
    const id = "claude-sess-001";
    mkdirSync(join(claudeHome, "session-env", id), { recursive: true });
    const r = validateSessionId(id, { claudeHome, codexHome });
    assert.equal(r.ok, true);
    assert.equal(r.agent, "claude");
  });

  it("accepts claude projects jsonl evidence", () => {
    const id = "claude-jsonl-002";
    writeFileSync(
      join(claudeHome, "projects", "proj1", `${id}.jsonl`),
      "{}\n",
    );
    const r = validateSessionId(id, { claudeHome, codexHome });
    assert.equal(r.ok, true);
    assert.equal(r.agent, "claude");
  });

  it("accepts codex session_index evidence", () => {
    const id = "codex-idx-003";
    writeFileSync(
      join(codexHome, "session_index.jsonl"),
      `${JSON.stringify({ id })}\n`,
    );
    const r = validateSessionId(id, { claudeHome, codexHome });
    assert.equal(r.ok, true);
    assert.equal(r.agent, "codex");
  });

  it("accepts codex sessions filename evidence", () => {
    const id = "codex-file-004";
    writeFileSync(
      join(codexHome, "sessions", "2026", `rollout-x-${id}.jsonl`),
      "",
    );
    const r = validateSessionId(id, { claudeHome, codexHome });
    assert.equal(r.ok, true);
    assert.equal(r.agent, "codex");
  });

  it("rejects invalid charset before probing", () => {
    const r = validateSessionId("bad/id", { claudeHome, codexHome });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid-session-id");
  });
});
