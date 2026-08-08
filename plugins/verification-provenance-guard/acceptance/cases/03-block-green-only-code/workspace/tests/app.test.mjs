import assert from "node:assert/strict";
import { test } from "node:test";

import { value } from "../src/app.js";

test("value is two", () => {
  assert.equal(value, 2);
});
