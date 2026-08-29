import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluatePptxShell, parseShellWords } from "../../../src/domains/presentation/lib/shell-policy.js";

const PLUGIN_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const workspaceRoot = "/work/demo";
const projectRoot = `${workspaceRoot}/artifacts/pptx/deck`;

test("shell parser rejects operators, substitutions, and unterminated quotes", () => {
  for (const command of ["echo ok > x", "node $(whoami)", "node `whoami`", "node x && touch y", "node 'unterminated"]) assert.equal(parseShellWords(command), null);
});

test("shell policy admits an exact registered writer and reports its bound argv", () => {
  const script = resolve(PLUGIN_ROOT, "dist/cli/harness.mjs");
  const decision = evaluatePptxShell({ command: `node "${script}" presentation render "${projectRoot}"`, cwd: workspaceRoot, workspaceRoot });
  assert.deepEqual(decision, { decision: "allow", writer: "pptx-render", projectRoot, argv: [script, "presentation", "render", projectRoot] });
});

test("shell policy rejects community writers and chained registered commands in PPTX scope", () => {
  const script = resolve(PLUGIN_ROOT, "dist/cli/harness.mjs");
  for (const command of [
    `node /tmp/pptx-generator.js ${projectRoot}`,
    `node "${script}" presentation render "${projectRoot}" && touch "${projectRoot}/dist/forged.pptx"`,
    `python /tmp/impeccable.py ${projectRoot}`,
  ]) assert.equal(evaluatePptxShell({ command, cwd: workspaceRoot, workspaceRoot }).decision, "deny");
});

test("shell policy permits narrow read-only inspection inside PPTX scope", () => {
  assert.deepEqual(evaluatePptxShell({ command: "rg TODO .", cwd: projectRoot, workspaceRoot }), { decision: "allow" });
  assert.equal(evaluatePptxShell({ command: "git clean -fdx", cwd: projectRoot, workspaceRoot }).decision, "deny");
});

test("an existing PPTX project does not scope unrelated repo-root interpreters", () => {
  assert.deepEqual(
    evaluatePptxShell({ command: "node --input-type=module -e 'console.log(1)'", cwd: workspaceRoot, workspaceRoot, activeProjectCount: 1 }),
    { decision: "allow" },
  );
});

test("a project initializer canonicalizes a missing project beneath an aliased workspace path", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pptx-shell-init-alias-"));
  try {
    mkdirSync(join(workspace, "artifacts", "pptx"), { recursive: true });
    const canonicalWorkspace = realpathSync(workspace);
    const rawProject = join(workspace, "artifacts", "pptx", "new-deck");
    const canonicalProject = join(canonicalWorkspace, "artifacts", "pptx", "new-deck");
    const script = resolve(PLUGIN_ROOT, "dist/cli/harness.mjs");
    assert.deepEqual(evaluatePptxShell({
      command: `node "${script}" presentation init "${rawProject}"`,
      cwd: workspace,
      workspaceRoot: canonicalWorkspace,
    }), { decision: "allow", writer: "pptx-init", projectRoot: canonicalProject, argv: [script, "presentation", "init", canonicalProject] });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
