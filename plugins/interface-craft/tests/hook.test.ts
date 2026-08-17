import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../dist/hooks/interface-craft.mjs", import.meta.url));

function run(mode: string, event: Record<string, unknown>) {
  return spawnSync(process.execPath, [HOOK, mode], {
    input: JSON.stringify(event),
    encoding: "utf8",
  });
}

test("invalid hook JSON fails open", () => {
  const result = spawnSync(process.execPath, [HOOK, "post"], { input: "{", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("PostToolUse reports a hard offset shadow and Stop dedupes it", () => {
  const root = mkdtempSync(join(tmpdir(), "interface-craft-"));
  const css = join(root, "page.css");
  writeFileSync(css, "section { box-shadow: 8px 8px 0 black; }\n");
  const event = {
    session_id: `session-${Date.now()}`,
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: css },
  };
  const post = run("post", event);
  assert.equal(post.status, 0, post.stderr);
  assert.match(post.stdout, /HARD_OFFSET_SHADOW/u);
  const stop = run("stop", { session_id: event.session_id, cwd: root });
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
