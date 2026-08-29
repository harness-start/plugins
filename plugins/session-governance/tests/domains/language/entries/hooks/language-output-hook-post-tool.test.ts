import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const entry = resolve(import.meta.dirname, "../../../../../dist/hooks/dispatcher.mjs");

test("PostToolUse validates generated files against artifactProfile", () => {
  const cwd = mkdtempSync(join(tmpdir(), "language-post-entry-"));
  const data = mkdtempSync(join(tmpdir(), "language-post-data-"));
  try {
    writeFileSync(join(cwd, ".language-output.mjs"), "export default { defaultProfile: 'zh-CN', artifactProfile: 'ja-JP' };\n");
    const result = spawnSync(process.execPath, [entry, "codex", "PostToolUse"], {
      input: JSON.stringify({
        cwd,
        session_id: "artifact-post",
        tool_name: "Write",
        tool_input: { file_path: "guide.md", content: "設定を保存してからテストを実行してください。" },
      }),
      encoding: "utf8",
      env: { ...process.env, PLUGIN_DATA: data },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
});
