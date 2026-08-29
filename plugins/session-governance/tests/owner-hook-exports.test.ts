import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import type { main as postHook } from "../src/domains/language/entries/hooks/language-output-hook-post-tool.js";
import type { main as sessionHook } from "../src/domains/language/entries/hooks/language-output-hook-session-start.js";
import type { main as stopHook } from "../src/domains/language/entries/hooks/language-output-hook-stop.js";
import type { main as promptHook } from "../src/domains/language/entries/hooks/language-output-hook-user-prompt.js";

void (null as unknown as typeof postHook | typeof sessionHook | typeof stopHook | typeof promptHook);

test("language hook implementations are import-safe owner handlers", () => {
  for (const name of [
    "language-output-hook-post-tool.ts",
    "language-output-hook-session-start.ts",
    "language-output-hook-stop.ts",
    "language-output-hook-user-prompt.ts",
  ]) {
    const source = readFileSync(resolve(import.meta.dirname, "../src/domains/language/entries/hooks", name), "utf8");
    assert.doesNotMatch(source, /\nmain\(\)\.catch/u);
  }
});
