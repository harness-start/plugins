import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluatePptxShell, parseShellWords } from "../src/lib/shell-policy.js";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = "/work/demo";
const projectRoot = `${workspaceRoot}/artifacts/pptx/deck`;

test("shell parser rejects operators, substitutions, and unterminated quotes", () => {
  for (const command of ["echo ok > x", "node $(whoami)", "node `whoami`", "node x && touch y", "node 'unterminated"]) assert.equal(parseShellWords(command), null);
});

test("shell policy admits an exact registered writer and reports its bound argv", () => {
  const script = resolve(PLUGIN_ROOT, "dist/cli/project-render.mjs");
  const decision = evaluatePptxShell({ command: `node "${script}" "${projectRoot}"`, cwd: workspaceRoot, workspaceRoot });
  assert.deepEqual(decision, { decision: "allow", writer: "pptx-render", projectRoot, argv: [script, projectRoot] });
});

test("shell policy rejects community writers and chained registered commands in PPTX scope", () => {
  const script = resolve(PLUGIN_ROOT, "dist/cli/project-render.mjs");
  for (const command of [
    `node /tmp/pptx-generator.js ${projectRoot}`,
    `node "${script}" "${projectRoot}" && touch "${projectRoot}/dist/forged.pptx"`,
    `python /tmp/impeccable.py ${projectRoot}`,
  ]) assert.equal(evaluatePptxShell({ command, cwd: workspaceRoot, workspaceRoot }).decision, "deny");
});

test("shell policy permits narrow read-only inspection inside PPTX scope", () => {
  assert.deepEqual(evaluatePptxShell({ command: "rg TODO .", cwd: projectRoot, workspaceRoot }), { decision: "allow" });
  assert.equal(evaluatePptxShell({ command: "git clean -fdx", cwd: projectRoot, workspaceRoot }).decision, "deny");
});
