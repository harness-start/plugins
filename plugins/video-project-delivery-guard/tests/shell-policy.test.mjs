import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateVideoShell } from "../scripts/lib/shell-policy.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/u, "");

test("allows only an exact installed-plugin writer invocation", () => {
  const previous = process.env.PLUGIN_ROOT;
  process.env.PLUGIN_ROOT = PLUGIN_ROOT;
  try {
    const result = evaluateVideoShell({
      command: 'node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" artifacts/video/demo final',
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
    command: `node "${PLUGIN_ROOT}/scripts/tools/project-render.mjs" artifacts/video/demo final ; node -e "0"`,
    cwd: "/workspace",
    workspaceRoot: "/workspace",
  });

  assert.equal(result.decision, "deny");
});
