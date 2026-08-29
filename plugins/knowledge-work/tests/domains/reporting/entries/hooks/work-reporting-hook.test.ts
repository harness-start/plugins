import assert from "node:assert/strict";
import { test } from "node:test";

import { main } from "../../../../../src/domains/reporting/entries/hooks/work-reporting-hook.js";

test("work reporting Hook remains an import-safe owner handler", () => {
  assert.equal(typeof main, "function");
});
