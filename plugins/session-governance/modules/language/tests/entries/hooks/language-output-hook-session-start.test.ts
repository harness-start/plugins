import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const entry = resolve(import.meta.dirname, "../../../dist/hooks/language-output-hook-session-start.mjs");

test("SessionStart reports the configured artifact profile independently", () => {
  const cwd = mkdtempSync(join(tmpdir(), "language-session-entry-"));
  const data = mkdtempSync(join(tmpdir(), "language-session-data-"));
  try {
    writeFileSync(join(cwd, ".language-output.mjs"), "export default { defaultProfile: 'zh-CN', artifactProfile: 'ja-JP' };\n");
    const result = spawnSync(process.execPath, [entry], {
      input: JSON.stringify({ cwd, session_id: "artifact-session" }),
      encoding: "utf8",
      env: { ...process.env, PLUGIN_DATA: data },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /profile=zh-CN.*artifact-profile=ja-JP/iu);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});
