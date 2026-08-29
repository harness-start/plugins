import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { evaluateLogoShell } from "../../../../src/domains/logo/lib/shell-policy.js";

test("logo shell policy ignores repo-root work when the command does not touch artifacts/logo", () => {
  const cwd = mkdtempSync(join(tmpdir(), "logo-shell-scope-"));
  const workspaceRoot = cwd;
  for (const command of [
    "sed -n '1,20p' README.md",
    "pnpm test",
    "rg -n foo SKILL.md",
    "node --input-type=module -e 'console.log(1)'",
  ]) {
    assert.deepEqual(
      evaluateLogoShell({ command, cwd, workspaceRoot, activeProjectCount: 1 }),
      { decision: "allow" },
      command,
    );
  }
});

test("logo shell policy still fail-closes mutations that mention artifacts/logo", () => {
  const cwd = mkdtempSync(join(tmpdir(), "logo-shell-touch-"));
  const result = evaluateLogoShell({
    command: "sed -i '' 's/a/b/' artifacts/logo/orbit/dist/primary/mark.svg",
    cwd,
    workspaceRoot: cwd,
    activeProjectCount: 1,
  });
  assert.equal(result.decision, "deny");
  if (result.decision === "deny") assert.equal(result.code, "UNKNOWN_MUTATION_SHELL");
});
