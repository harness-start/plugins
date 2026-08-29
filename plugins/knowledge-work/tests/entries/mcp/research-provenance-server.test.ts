import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("research provenance MCP is an owner entry rather than a private domain entry", () => {
  assert.equal(existsSync(fileURLToPath(new URL("../../../src/entries/mcp/research-provenance-server.ts", import.meta.url))), true);
  assert.equal(existsSync(fileURLToPath(new URL("../../../src/domains/research/entries/mcp/research-provenance-server.ts", import.meta.url))), false);
});
