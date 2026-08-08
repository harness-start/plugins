import assert from "node:assert/strict";
import { test } from "node:test";

import { value } from "../src/app.js";

test("value is updated", () => {
  assert.equal(value, 1);
});
