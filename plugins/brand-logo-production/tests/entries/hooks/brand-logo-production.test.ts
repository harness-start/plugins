import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Codex writer grants prefer the child thread principal", () => {
  const source = readFileSync(fileURLToPath(new URL("../../../src/entries/hooks/brand-logo-production.ts", import.meta.url)), "utf8");
  assert.match(source, /HARNESS_HOST/u);
  assert.match(source, /CODEX_THREAD_ID/u);
  assert.match(source, /if \(codexThreadId\) return codexThreadId/u);
  assert.match(source, /codexHome/u);
  assert.match(source, /trustedCodexHome\s*\?\s*\{\s*codexHome:\s*trustedCodexHome\s*\}\s*:\s*\{\}/u);
});
