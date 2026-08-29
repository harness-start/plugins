import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateRegisteredWriter, parseShellWords } from "@harness/core/artifact-shell";

test("registered writer must use the owner harness resource and action", () => {
  const toolDirectory = "/plugins/artifact-production/dist/cli";
  const allowed = evaluateRegisteredWriter({
    command: "node /plugins/artifact-production/dist/cli/harness.mjs presentation release /ws/artifacts/pptx/id",
    cwd: "/ws",
    workspaceRoot: "/ws",
    carrier: "pptx",
    writers: ["project-lint.mjs", "project-release.mjs"],
    toolDirectory,
    resource: "presentation",
  });
  assert.deepEqual(allowed, {
    ok: true,
    writer: "project-release.mjs",
    projectRoot: "/ws/artifacts/pptx/id",
  });

  const legacy = evaluateRegisteredWriter({
    command: "node /plugins/presentation-production/scripts/tools/project-release.mjs /ws/artifacts/pptx/id",
    cwd: "/ws",
    workspaceRoot: "/ws",
    carrier: "pptx",
    writers: ["project-lint.mjs", "project-release.mjs"],
    toolDirectory,
    resource: "presentation",
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
