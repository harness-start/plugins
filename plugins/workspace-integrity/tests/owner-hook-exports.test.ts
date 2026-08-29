import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import type { main as postHook } from "../src/domains/commands/entries/hooks/cmd-safety-hook-post-tool.js";
import type { main as preHook } from "../src/domains/commands/entries/hooks/cmd-safety-hook-pre-tool.js";

void (null as unknown as typeof postHook | typeof preHook);

test("command hook implementations are import-safe owner handlers", () => {
  for (const name of ["cmd-safety-hook-post-tool.ts", "cmd-safety-hook-pre-tool.ts"]) {
    const source = readFileSync(resolve(import.meta.dirname, "../src/domains/commands/entries/hooks", name), "utf8");
    assert.doesNotMatch(source, /\nmain\(\)\.catch/u);
  }
});
