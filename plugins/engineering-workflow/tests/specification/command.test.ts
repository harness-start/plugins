import assert from "node:assert/strict";
import { test } from "node:test";

import * as command from "../../src/domains/specification/command.js";

test("specification command exposes an import-safe owner command", () => {
  assert.equal(typeof (command as Record<string, unknown>).main, "function");
});
