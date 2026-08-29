import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateVideoShell } from "../../../src/domains/video/lib/shell-policy.js";

const PLUGIN_ROOT = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/u, "");

test("allows only an exact installed-plugin writer invocation", () => {
  const previous = process.env.PLUGIN_ROOT;
  process.env.PLUGIN_ROOT = PLUGIN_ROOT;
  try {
    const result = evaluateVideoShell({
      command: 'node "${PLUGIN_ROOT}/dist/cli/harness.mjs" video render artifacts/video/demo final',
      cwd: "/workspace",
      workspaceRoot: "/workspace",
    });

    assert.equal(result.decision, "allow");
    assert.equal(result.writer, "video-render");
  } finally {
    if (previous === undefined) delete process.env.PLUGIN_ROOT;
    else process.env.PLUGIN_ROOT = previous;
  }
});

test("rejects compounds even when they contain an exact writer path", () => {
  const result = evaluateVideoShell({
    command: `node "${PLUGIN_ROOT}/dist/cli/harness.mjs" video render artifacts/video/demo final ; node -e "0"`,
    cwd: "/workspace",
    workspaceRoot: "/workspace",
  });

  assert.equal(result.decision, "deny");
});

test("allows the exact project initializer with one profile and execution mode", () => {
  const result = evaluateVideoShell({
    command: `node "${PLUGIN_ROOT}/dist/cli/harness.mjs" video init artifacts/video/demo --profile short-form --mode guided`,
    cwd: "/workspace",
    workspaceRoot: "/workspace",
  });

  assert.equal(result.decision, "allow");
  assert.equal(result.writer, "video-init");
});

test("allows admission only through the exact wrapper command", () => {
  const result = evaluateVideoShell({
    command: `node "${PLUGIN_ROOT}/dist/cli/harness.mjs" video admit artifacts/video/demo /tmp/video-run.json`,
    cwd: "/workspace",
    workspaceRoot: "/workspace",
  });

  assert.equal(result.decision, "allow");
  assert.equal(result.writer, "video-admit");
});

test("allows shot staging only with an exact beat, recipe, and style tuple", () => {
  const allowed = evaluateVideoShell({
    command: `node "${PLUGIN_ROOT}/dist/cli/harness.mjs" video shot-stage artifacts/video/demo hook deck-deal-flyin deck-deal-flyin`,
    cwd: "/workspace",
    workspaceRoot: "/workspace",
  });
  const missingStyle = evaluateVideoShell({
    command: `node "${PLUGIN_ROOT}/dist/cli/harness.mjs" video shot-stage artifacts/video/demo hook deck-deal-flyin`,
    cwd: "/workspace",
    workspaceRoot: "/workspace",
  });

  assert.equal(allowed.decision, "allow");
  assert.equal(allowed.writer, "video-shot-stage");
  assert.equal(missingStyle.decision, "deny");
});

test("an existing video project does not scope unrelated repo-root interpreters", () => {
  assert.deepEqual(evaluateVideoShell({
    command: "node --input-type=module -e 'console.log(1)'",
    cwd: "/workspace",
    workspaceRoot: "/workspace",
    activeProjectCount: 1,
  }), { decision: "allow" });
});
