import assert from "node:assert/strict";
import { test } from "node:test";

import { reserveAndBindIndependentReviewer } from "./workflow.mjs";

test("reasoning workflow exposes atomic direct reviewer binding", () => {
  assert.equal(typeof reserveAndBindIndependentReviewer, "function");
});
