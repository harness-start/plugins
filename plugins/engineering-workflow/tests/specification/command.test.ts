import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import * as command from "../../src/domains/specification/command.js";

test("specification command exposes an import-safe owner command", () => {
  assert.equal(typeof (command as Record<string, unknown>).main, "function");
});

test("specification digest executes only when its owner route calls main", () => {
  const root = mkdtempSync(join(tmpdir(), "specification-command-"));
  const target = join(root, "input.txt");
  writeFileSync(target, "stable input\n");
  let stdout = "";
  const write = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    command.main(["digest", target]);
  } finally {
    process.stdout.write = write;
  }

  assert.match(stdout, /^[a-f0-9]{64}\n$/u);
});
