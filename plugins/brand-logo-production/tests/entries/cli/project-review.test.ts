import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("project review validates Codex transcript provenance at admission", () => {
  const source = readFileSync(fileURLToPath(new URL("../../../src/entries/cli/project-review.ts", import.meta.url)), "utf8");
  assert.match(source, /validateCodexReviewIdentity/u);
  assert.match(source, /grant\.codexHome/u);
  assert.match(source, /currentThreadId:\s*grant\.sessionId/u);
  assert.doesNotMatch(source, /process\.env\.CODEX_HOME/u);
  assert.match(source, /transcriptPath/u);
});
