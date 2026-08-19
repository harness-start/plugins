import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeWindow } from "../src/window-summary.mjs";

test("summarizes several samples without changing the output contract", () => {
  assert.deepEqual(summarizeWindow([2, 4, 6], 2), {
    count: 3,
    average: 4,
    bins: [8, 4],
  });
});
