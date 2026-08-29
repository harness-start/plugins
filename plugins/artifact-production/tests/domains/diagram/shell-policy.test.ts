import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { evaluateDiagramShell, parseShellWords } from "../../../src/domains/diagram/lib/shell-policy.js";

const workspaceRoot = "/tmp/diagram-shell-workspace";
const projectRoot = `${workspaceRoot}/artifacts/diagram/service-flow`;
const tool = resolve("plugins/artifact-production/dist/cli/harness.mjs");

test("shell parser rejects operators and command substitution", () => {
  assert.equal(parseShellWords("ls; touch artifacts/diagram/x"), null);
  assert.equal(parseShellWords("node $(pwd)/tool.mjs artifacts/diagram/x"), null);
});

test("registered import requires an absolute source path and exact argv", () => {
  assert.equal(evaluateDiagramShell({ command: `node ${tool} diagram import ${projectRoot} source.mmd`, cwd: workspaceRoot, workspaceRoot }).decision, "deny");
  assert.equal(evaluateDiagramShell({ command: `node ${tool} diagram import ${projectRoot} /tmp/source.mmd`, cwd: workspaceRoot, workspaceRoot }).decision, "allow");
  assert.equal(evaluateDiagramShell({ command: `node ${tool} diagram import ${projectRoot} /tmp/source.mmd extra`, cwd: workspaceRoot, workspaceRoot }).decision, "deny");
});

test("mutating find and interpreter escape hatches are denied in diagram scope", () => {
  assert.equal(evaluateDiagramShell({ command: "find . -fprint output.txt", cwd: projectRoot, workspaceRoot }).decision, "deny");
  assert.equal(evaluateDiagramShell({ command: "node -e process.exit()", cwd: projectRoot, workspaceRoot }).decision, "deny");
});

test("an existing diagram project does not scope unrelated repo-root interpreters", () => {
  assert.deepEqual(
    evaluateDiagramShell({ command: "node --input-type=module -e 'console.log(1)'", cwd: workspaceRoot, workspaceRoot, activeProjectCount: 1 }),
    { decision: "allow" },
  );
});
