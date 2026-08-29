import assert from "node:assert/strict";
import { test } from "node:test";

import { main } from "../../src/domains/debugging/command.js";

test("debugging command exposes an import-safe owner command", () => {
  assert.equal(typeof main, "function");
});

test("debugging command help returns usage without invoking a writer", async () => {
  let stdout = "";
  const write = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    await main(["claim", "--help"]);
  } finally {
    process.stdout.write = write;
  }

  assert.match(stdout, /Usage: harness debug claim/u);
  assert.doesNotMatch(stdout, /"ok"/u);
});

test("debugging command accepts the short help flag", async () => {
  let stdout = "";
  const write = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    await main(["claim", "-h"]);
  } finally {
    process.stdout.write = write;
  }

  assert.match(stdout, /Usage: harness debug claim/u);
});
