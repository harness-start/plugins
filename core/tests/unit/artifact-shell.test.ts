import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateRegisteredWriter, parseShellWords } from "@harness/core/artifact-shell";

test("registered writer must be node dist/cli/<writer> <projectRoot>", () => {
  const toolDirectory = "/plugins/pptx-project-delivery-guard/dist/cli";
  const allowed = evaluateRegisteredWriter({
    command: "node /plugins/pptx-project-delivery-guard/dist/cli/project-release.mjs /ws/artifacts/pptx/id",
    cwd: "/ws",
    workspaceRoot: "/ws",
    carrier: "pptx",
    writers: ["project-lint.mjs", "project-release.mjs"],
    toolDirectory,
  });
  assert.deepEqual(allowed, {
    ok: true,
    writer: "project-release.mjs",
    projectRoot: "/ws/artifacts/pptx/id",
  });

  const legacy = evaluateRegisteredWriter({
    command: "node /plugins/pptx-project-delivery-guard/scripts/tools/project-release.mjs /ws/artifacts/pptx/id",
    cwd: "/ws",
    workspaceRoot: "/ws",
    carrier: "pptx",
    writers: ["project-lint.mjs", "project-release.mjs"],
    toolDirectory,
  });
  assert.equal(legacy.ok, false);
});

test("parseShellWords rejects compound shell metacharacters", () => {
  assert.equal(parseShellWords("node a.mjs && rm -rf /"), null);
  assert.deepEqual(parseShellWords("node a.mjs /ws/artifacts/pptx/id"), [
    "node",
    "a.mjs",
    "/ws/artifacts/pptx/id",
  ]);
});
