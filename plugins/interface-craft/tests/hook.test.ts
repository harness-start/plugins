import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../dist/hooks/interface-craft.mjs", import.meta.url));

function run(mode: string, event: Record<string, unknown>, env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [HOOK, mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("invalid hook JSON fails open", () => {
  const result = spawnSync(process.execPath, [HOOK, "post"], { input: "{", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("PostToolUse reports a hard offset shadow and Stop dedupes it", () => {
  const root = mkdtempSync(join(tmpdir(), "interface-craft-"));
  const data = mkdtempSync(join(tmpdir(), "interface-craft-data-"));
  const css = join(root, "page.css");
  writeFileSync(css, "section { box-shadow: 8px 8px 0 black; }\n");
  const event = {
    session_id: `session-${Date.now()}`,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: css },
  };
  const env = { HARNESS_HOST: "codex", PLUGIN_DATA: data };
  const post = run("post", event, env);
  assert.equal(post.status, 0, post.stderr);
  assert.match(post.stdout, /HARD_OFFSET_SHADOW/u);
  const stop = run("stop", { session_id: event.session_id, cwd: root }, env);
  assert.equal(stop.status, 0, stop.stderr);
  assert.doesNotMatch(stop.stdout, /HARD_OFFSET_SHADOW/u);
});

test("non-UI writes stay silent", () => {
  const root = mkdtempSync(join(tmpdir(), "interface-craft-"));
  const file = join(root, "notes.md");
  writeFileSync(file, "box-shadow: 4px 4px 0 #000\n");
  const result = run("post", {
    session_id: "plain",
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: file },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("PostToolUse reports transition-all and removed focus outlines through the bundled Hook", () => {
  const root = mkdtempSync(join(tmpdir(), "interface-craft-"));
  const css = join(root, "controls.css");
  writeFileSync(css, "button { transition: all 200ms ease; outline: none; }\n");
  const result = run("post", {
    session_id: `motion-${Date.now()}`,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: css },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TRANSITION_ALL/u);
  assert.match(result.stdout, /FOCUS_OUTLINE_REMOVED/u);
});

test("session ledger is platform-scoped, private, and disabled without a session id", () => {
  const root = mkdtempSync(join(tmpdir(), "interface-craft-state-"));
  const data = join(root, "codex-data");
  const css = join(root, "page.css");
  writeFileSync(css, "section { box-shadow: 8px 8px 0 black; }\n");
  const env = { HARNESS_HOST: "codex", PLUGIN_DATA: data };
  const event = {
    session_id: "private-ledger",
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: css },
  };
  const persisted = run("post", event, env);
  assert.equal(persisted.status, 0, persisted.stderr);
  const ledgerDirectory = join(data, "interface-craft", "sessions");
  assert.equal(existsSync(ledgerDirectory), true);
  assert.equal(statSync(ledgerDirectory).mode & 0o777, 0o700);
  const ledgerFiles = readdirSync(ledgerDirectory);
  assert.equal(ledgerFiles.length, 1);
  assert.equal(statSync(join(ledgerDirectory, ledgerFiles[0])).mode & 0o777, 0o600);

  const noSession = run("post", { ...event, session_id: "" }, env);
  assert.equal(noSession.status, 0, noSession.stderr);
  assert.equal(readdirSync(ledgerDirectory).length, 1);
});
