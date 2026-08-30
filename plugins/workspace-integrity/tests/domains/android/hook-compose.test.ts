import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));

function runPost(cwd: string, filePath: string) {
  return spawnSync(process.execPath, [HOOK, "codex", "PostToolUse"], {
    cwd,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "PLUGIN_ROOT")),
    input: JSON.stringify({
      session_id: "compose-scan",
      cwd,
      tool_name: "Write",
      tool_input: { file_path: filePath },
    }),
    encoding: "utf8",
  });
}

function output(result: ReturnType<typeof spawnSync>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

test("PostToolUse reports collectAsState on Kotlin in an Android workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "android-compose-"));
  writeFileSync(join(root, "AndroidManifest.xml"), "<manifest />\n");
  spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  const kotlin = join(root, "app", "src", "main", "java", "Pane.kt");
  mkdirSync(dirname(kotlin), { recursive: true });
  writeFileSync(kotlin, "val user by model.user.collectAsState()\n");
  const result = runPost(root, kotlin);
  assert.equal(result.status, 0, result.stderr);
  assert.match(output(result), /COLLECT_AS_STATE/u);
  assert.match(output(result), /composeCollectAsState/u);
});

test("PostToolUse stays silent for lifecycle-aware collection", () => {
  const root = mkdtempSync(join(tmpdir(), "android-compose-clean-"));
  writeFileSync(join(root, "AndroidManifest.xml"), "<manifest />\n");
  spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  const kotlin = join(root, "Pane.kt");
  writeFileSync(kotlin, "val user by model.user.collectAsStateWithLifecycle()\n");
  const result = runPost(root, kotlin);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(output(result), /COLLECT_AS_STATE/u);
});

test("bundled XML validation accepts a valid Android manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "android-xml-valid-"));
  spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  const manifest = join(root, "AndroidManifest.xml");
  writeFileSync(manifest, "<manifest package=\"example.fixture\" />\n");
  const result = runPost(root, manifest);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(output(result), /DOMParser is not a constructor/u);
});
