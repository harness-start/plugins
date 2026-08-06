import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { environmentContext, lintCoverageContext } from "../scripts/checks/runtime-context.mjs";

test("Python context reports environment and Ruff coverage gaps", () => {
  const root = mkdtempSync(join(tmpdir(), "python-context-"));
  try {
    writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "api"\ndependencies = ["fastapi"]\n\n[tool.ruff.lint]\nselect = ["B"]\n');
    assert.match(environmentContext({ cwd: root }), /FastAPI/u);
    const coverage = lintCoverageContext({ cwd: root });
    assert.match(coverage, /S/u); assert.match(coverage, /DTZ/u); assert.match(coverage, /ASYNC/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
