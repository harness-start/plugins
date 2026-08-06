import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { environmentContext, lintCoverageContext, toolOutputReport } from "../scripts/checks/runtime-context.mjs";

test("Go context reports module and missing lint config", () => {
  const root = mkdtempSync(join(tmpdir(), "go-context-"));
  try { writeFileSync(join(root, "go.mod"), "module example.com/api\n\ngo 1.24\n"); assert.match(environmentContext({ cwd: root }), /example\.com\/api/u); assert.match(lintCoverageContext({ cwd: root }), /not found/u); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("Go tool output primer summarizes failing JSON events", () => {
  const output = toolOutputReport({ tool_input: { command: "go test -json ./..." }, tool_response: { stdout: '{"Action":"fail","Package":"example.com/api","Test":"TestAPI"}\n' } });
  assert.match(output, /TestAPI/u);
});
