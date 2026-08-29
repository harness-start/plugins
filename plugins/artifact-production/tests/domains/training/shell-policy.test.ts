import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateTrainingShell, parseShellWords } from "../../../src/domains/training/lib/shell-policy.js";

const PLUGIN_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const workspaceRoot = "/work/demo";
const projectRoot = `${workspaceRoot}/artifacts/training/course`;

test("shell parser rejects operators, substitutions, and unterminated quotes", () => {
  for (const command of ["echo ok > x", "node $(whoami)", "node `whoami`", "node x && touch y", "node 'unterminated"]) assert.equal(parseShellWords(command), null);
});

test("shell policy admits an exact registered training writer", () => {
  const script = resolve(PLUGIN_ROOT, "dist/cli/harness.mjs");
  assert.deepEqual(
    evaluateTrainingShell({ command: `node "${script}" training render "${projectRoot}"`, cwd: workspaceRoot, workspaceRoot }),
    { decision: "allow", writer: "training-render", projectRoot, argv: [script, "training", "render", projectRoot] },
  );
});

test("shell policy rejects command chains and unknown mutation tools in training scope", () => {
  const script = resolve(PLUGIN_ROOT, "dist/cli/harness.mjs");
  for (const command of [`node "${script}" training render "${projectRoot}" && touch forged`, `python /tmp/course-writer.py ${projectRoot}`, `rm -rf ${projectRoot}`]) {
    assert.equal(evaluateTrainingShell({ command, cwd: workspaceRoot, workspaceRoot }).decision, "deny");
  }
});

test("shell policy allows bounded read-only inspection", () => {
  assert.deepEqual(evaluateTrainingShell({ command: "rg TODO .", cwd: projectRoot, workspaceRoot }), { decision: "allow" });
  assert.equal(evaluateTrainingShell({ command: "git clean -fdx", cwd: projectRoot, workspaceRoot }).decision, "deny");
});

test("an existing training project does not scope unrelated repo-root interpreters", () => {
  assert.deepEqual(
    evaluateTrainingShell({ command: "node --input-type=module -e 'console.log(1)'", cwd: workspaceRoot, workspaceRoot, activeProjectCount: 1 }),
    { decision: "allow" },
  );
});
