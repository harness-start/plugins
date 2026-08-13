import assert from "node:assert/strict";
import { test } from "node:test";

import { bindReviewer } from "./independent-review.mjs";

test("first-principles review exposes the guarded binding seam", () => {
  assert.equal(typeof bindReviewer, "function");
});
