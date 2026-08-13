import assert from "node:assert/strict";
import { test } from "node:test";

import { reserveAndBindDebugReviewer } from "./workflow.mjs";

test("debug workflow exposes atomic direct reviewer binding", () => {
  assert.equal(typeof reserveAndBindDebugReviewer, "function");
});
